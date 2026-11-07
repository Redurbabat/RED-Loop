import SwiftUI
import UIKit
import WebKit

/// Delegate for the in-app ChatGPT view. Kept separate from the observable
/// controller so WebKit's callbacks stay on plain, non-isolated methods.
final class ChatBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let handlerName = "redLoop"
    static let start = URL(string: "https://chatgpt.com/")!
    /// Hosts that may stay inside the app: ChatGPT itself, its sign-in services
    /// and the identity providers its login offers. Everything else is handed
    /// to the system browser instead of being opened in the signed-in view.
    static let allowedHosts: Set<String> = [
        "chatgpt.com", "chat.openai.com", "openai.com", "auth.openai.com", "auth0.openai.com",
        "platform.openai.com", "cdn.oaistatic.com", "cdn.auth0.com", "challenges.cloudflare.com",
        "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com", "login.live.com"
    ]
    weak var controller: ChatController?

    static func isChatHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "chatgpt.com" || host == "chat.openai.com" || host.hasSuffix(".chatgpt.com")
    }

    static func staysInApp(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return allowedHosts.contains(host) || host.hasSuffix(".openai.com") || host.hasSuffix(".chatgpt.com") || host.hasSuffix(".oaistatic.com")
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only the signed-in ChatGPT page may report panel status.
        guard ChatBridge.isChatHost(message.frameInfo.securityOrigin.host),
              let state = ChatLoopState(message: message.body) else { return }
        let target = self.controller
        Task { @MainActor in target?.apply(state) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if let frame = action.targetFrame, !frame.isMainFrame { return decisionHandler(.allow) }
        let external = {
            if ["http", "https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") {
                Task { @MainActor in UIApplication.shared.open(url) }
            }
            decisionHandler(.cancel)
        }
        if action.targetFrame == nil { return external() }
        guard ChatBridge.staysInApp(url.host) else { return external() }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let target = controller
        let address = webView.url
        Task { @MainActor in target?.finishedLoading(address) }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { report(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { report(error) }

    private func report(_ error: Error) {
        let target = controller
        let message = (error as NSError).code == NSURLErrorCancelled ? nil : error.localizedDescription
        Task { @MainActor in target?.failedLoading(message) }
    }
}

@MainActor
final class ChatController: ObservableObject {
    @Published private(set) var loop = ChatLoopState()
    @Published private(set) var script: ChatScript?
    @Published private(set) var webView: WKWebView?
    @Published private(set) var isPreparing = false
    @Published private(set) var setupError: String?
    @Published private(set) var pageError: String?
    @Published var useCloudScript: Bool {
        didSet { UserDefaults.standard.set(useCloudScript, forKey: ChatController.cloudPreference) }
    }
    @Published var notifyOnStop: Bool {
        didSet { UserDefaults.standard.set(notifyOnStop, forKey: ChatController.notifyPreference) }
    }
    private static let cloudPreference = "red-loop.chat.cloud-script"
    private static let notifyPreference = "red-loop.chat.notify-on-stop"
    private static let panelInset = 12
    private let bridge = ChatBridge()
    private let notifier = ChatNotifier()
    private let makeLoader: () -> ChatScriptLoader

    init(makeLoader: @escaping () -> ChatScriptLoader = { ChatScriptLoader() }) {
        self.makeLoader = makeLoader
        let defaults = UserDefaults.standard
        for key in [ChatController.cloudPreference, ChatController.notifyPreference]
        where defaults.object(forKey: key) == nil { defaults.set(true, forKey: key) }
        useCloudScript = defaults.bool(forKey: ChatController.cloudPreference)
        notifyOnStop = defaults.bool(forKey: ChatController.notifyPreference)
        bridge.controller = self
    }

    var scriptLabel: String {
        guard let script else { return "Skript wird geladen …" }
        return "Skript \(script.version) · Quelle: \(script.source.rawValue)"
    }

    /// Loads the continuation script, then builds the view that runs it. The
    /// script must be installed before the first page load, so the view is
    /// created only once the script is in hand.
    func prepare(force: Bool = false) async {
        guard !isPreparing, force || webView == nil else { return }
        isPreparing = true
        setupError = nil
        defer { isPreparing = false }
        let loader = makeLoader()
        do {
            let loaded = try await loader.script(allowCloud: useCloudScript)
            script = loaded
            let view = build(with: loaded)
            webView = view
            pageError = nil
            view.load(URLRequest(url: ChatBridge.start))
        } catch {
            setupError = error.localizedDescription
        }
    }

    private func build(with script: ChatScript) -> WKWebView {
        let content = WKUserContentController()
        content.add(bridge, name: ChatBridge.handlerName)
        content.addUserScript(WKUserScript(
            source: ChatScriptLoader.hostPrologue(bottomInset: ChatController.panelInset) + script.body,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true))
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = content
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        // ChatGPT serves its mobile layout to Safari; the view is WebKit too.
        configuration.applicationNameForUserAgent = "Version/17.0 Mobile/15E148 Safari/604.1"
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = bridge
        view.uiDelegate = bridge
        view.allowsBackForwardNavigationGestures = true
        return view
    }

    func apply(_ state: ChatLoopState) {
        let previous = loop
        loop = state
        // A running loop needs the screen awake; iOS suspends the page otherwise.
        UIApplication.shared.isIdleTimerDisabled = state.running
        if state.running && !previous.running { notifier.requestAuthorizationIfNeeded() }
        guard notifyOnStop, let notice = ChatStopClassifier.notice(previous: previous, current: state) else { return }
        notifier.announce(notice)
    }

    func finishedLoading(_ url: URL?) {
        if ChatBridge.staysInApp(url?.host) { pageError = nil }
    }

    func failedLoading(_ message: String?) {
        guard let message else { return }
        pageError = message
    }

    func setActive(_ active: Bool) {
        if !active { UIApplication.shared.isIdleTimerDisabled = false }
        else if loop.running { UIApplication.shared.isIdleTimerDisabled = true }
    }

    /// The panel's own Pause button, reachable from the app chrome even when the
    /// panel is minimized or scrolled away.
    func pause() {
        webView?.evaluateJavaScript("(()=>{const b=document.querySelector('#red-loop-root .rl-stop');if(b&&!b.disabled){b.click();return true}return false})()")
    }

    func revealPanel() {
        webView?.evaluateJavaScript("(()=>{const r=document.getElementById('red-loop-root');if(!r)return false;r.classList.remove('rl-min');const b=r.querySelector('.rl-collapse');if(b){b.textContent='−';b.setAttribute('aria-expanded','true')}r.scrollIntoView();return true})()")
    }

    func reload() {
        pageError = nil
        guard let webView else { return }
        if webView.url == nil { webView.load(URLRequest(url: ChatBridge.start)) } else { webView.reload() }
    }

    func goBack() { if webView?.canGoBack == true { webView?.goBack() } }
    func openStart() { webView?.load(URLRequest(url: ChatBridge.start)) }

    /// Removes the ChatGPT session from this app. Does not touch Safari.
    func signOut() async {
        pause()
        let store = webView?.configuration.websiteDataStore ?? .default()
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        let records = await store.dataRecords(ofTypes: types)
        await withCheckedContinuation { continuation in
            store.removeData(ofTypes: types, for: records) { continuation.resume() }
        }
        loop = ChatLoopState()
        UIApplication.shared.isIdleTimerDisabled = false
        openStart()
    }
}

struct ChatWebViewContainer: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct ChatView: View {
    @StateObject private var controller = ChatController()
    @Environment(\.scenePhase) private var scenePhase
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                content
                statusBar
            }
            .background(Color("Canvas"))
            .navigationTitle("ChatGPT")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Zurück", systemImage: "chevron.left") { controller.goBack() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("Mehr", systemImage: "ellipsis.circle") {
                        Button("Panel einblenden", systemImage: "square.topthird.inset.filled") { controller.revealPanel() }
                        Button("Neu laden", systemImage: "arrow.clockwise") { controller.reload() }
                        Button("Zur Chatübersicht", systemImage: "house") { controller.openStart() }
                        Divider()
                        Toggle("Melden, wenn der Loop anhält", isOn: $controller.notifyOnStop)
                        Toggle("Skript von Cloudflare laden", isOn: $controller.useCloudScript)
                        Button("Skript neu laden", systemImage: "arrow.down.doc") { Task { await controller.prepare(force: true) } }
                        Divider()
                        Button("ChatGPT-Anmeldung in der App löschen", systemImage: "person.crop.circle.badge.xmark", role: .destructive) { confirmingSignOut = true }
                    }
                }
            }
            .confirmationDialog("Anmeldung löschen?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                Button("Löschen", role: .destructive) { Task { await controller.signOut() } }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Entfernt Cookies und Website-Daten von ChatGPT aus dieser App. Safari und dein ChatGPT-Konto bleiben unberührt.")
            }
        }
        .task { await controller.prepare() }
        .onChange(of: controller.useCloudScript) { _, _ in Task { await controller.prepare(force: true) } }
        .onChange(of: scenePhase) { _, phase in controller.setActive(phase == .active) }
        .onDisappear { controller.setActive(false) }
    }

    @ViewBuilder private var content: some View {
        if let webView = controller.webView {
            ChatWebViewContainer(webView: webView)
                .id(ObjectIdentifier(webView))
                .ignoresSafeArea(edges: .horizontal)
        } else if let error = controller.setupError {
            ScrollView {
                GlassPanel {
                    Label("Loop-Skript nicht geladen", systemImage: "exclamationmark.triangle").font(.headline)
                    Text(error).font(.subheadline).foregroundStyle(.secondary)
                    Text("Ohne das Skript zeigt die App ChatGPT nicht an. Prüfe die Verbindung oder deaktiviere „Skript von Cloudflare laden“, um die mitgelieferte Fassung zu verwenden.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Button("Erneut versuchen") { Task { await controller.prepare(force: true) } }
                        .buttonStyle(.borderedProminent).frame(minHeight: 44)
                }.padding(24)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            VStack(spacing: 16) {
                ProgressView()
                Text("Loop-Skript laden …").font(.subheadline).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var statusBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error = controller.pageError {
                Label(error, systemImage: "wifi.exclamationmark").font(.caption).foregroundStyle(Morph.accent).lineLimit(2)
            }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(controller.loop.status).font(.caption).lineLimit(2)
                        .accessibilityLabel("Panel-Status: \(controller.loop.status)")
                    Text("\(controller.loop.progress) Fortsetzungen · \(controller.scriptLabel)")
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                Button { controller.pause() } label: {
                    Label("Pause", systemImage: "pause.fill").frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(!controller.loop.running)
                .accessibilityHint("Hält die automatischen Fortsetzungen an. Start erfolgt im Panel.")
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }
}

struct ChatInfoView: View {
    var body: some View {
        List {
            Section("So läuft ein Auftrag") {
                Text("1. Im Tab Chat bei ChatGPT anmelden. Die Anmeldung gilt nur in dieser App.")
                Text("2. Eine bestehende Unterhaltung öffnen oder eine neue anlegen und den Auftrag selbst schreiben. RED Loop schickt den ersten Auftrag nicht.")
                Text("3. Erste Antwort abwarten. Im RED-Loop-Panel steht der Folgetext für offene Aufgaben bereit, „Endlos bis Pause“ ist aktiv.")
                Text("4. Start drücken. Nach jeder fertigen Antwort sendet das Panel den Folgetext erneut, bis du Pause drückst.")
                Text("Pause ist unten in der App immer erreichbar. Start bleibt im Panel, damit Limit und Folgetext vorher geprüft werden.")
                Text("Du musst nicht zusehen: Hält der Loop von selbst an – Fertigmeldung, Rückfrage, Limit oder Fehler – meldet sich die App mit einer Mitteilung samt Grund. Eine Pause, die du selbst auslöst, meldet sie nicht. Abschaltbar im Menü des Chat-Tabs.")
            }
            Section("Wann der Loop selbst anhält") {
                Text("Bei [RED_LOOP_FERTIG] oder [RED_LOOP_RUECKFRAGE] als letzter Zeile einer fertigen Antwort, bei einem erkannten Antwortfehler, bei einem eigenen Entwurf im Eingabefeld, beim Wechsel der Unterhaltung und wenn das Eingabefeld fehlt.")
                Text("Diese Fertigmeldung ist die Aussage des Assistenten. RED Loop prüft nicht nach, ob die Arbeit wirklich erledigt ist.")
            }
            Section("Grenzen") {
                Text("Der Loop läuft nur, solange die App im Vordergrund ist. Während eines Laufs bleibt der Bildschirm an.")
                Text("Sperrt sich das iPhone oder wechselst du die App, hält iOS die Seite an. Beim Zurückkehren wartet das Panel weiter; hat iOS die Seite verworfen, meldet es „Pausiert: Seite verlassen“ und ein Start setzt denselben Lauf mit demselben Zähler fort.")
                Text("Für Arbeit nach dem Schließen der App sind Cloud-Aufträge gedacht. Diese laufen auf dem Server und sind von dieser Ansicht getrennt.")
                Text("Automatische Fortsetzungen verbrauchen laufend dein ChatGPT-Kontingent und unterliegen den Bedingungen des Dienstes. Ändert ChatGPT seine Oberfläche, kann das Panel ausfallen.")
            }
            Section("Skriptquelle") {
                Text("Das Panel ist dasselbe Skript wie in der Safari- und Edge-Erweiterung. Die App lädt es von deinem privaten RED-Loop-Server, damit eine Anpassung an ChatGPT ohne neuen App-Build ausgeliefert werden kann; die letzte geladene und die mitgelieferte Fassung dienen als Rückfall.")
                Text("Wer auf diesen Server veröffentlichen kann, bestimmt damit Code, der in deiner angemeldeten ChatGPT-Seite läuft. Im Menü des Chat-Tabs lässt sich das Laden abschalten.")
            }
        }.navigationTitle("Chat-Info")
    }
}
