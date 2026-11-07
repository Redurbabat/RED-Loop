import SwiftUI

@MainActor
struct CloudRootView: View {
    @StateObject private var store = CloudStore()
    @State private var selectedTab = 0
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TabView(selection: $selectedTab) {
            CloudJobsView(store: store).tabItem { Label("Aufträge", systemImage: "tray.full") }.tag(0)
            LocalDemoView().tabItem { Label("Lokale Demo", systemImage: "play.rectangle") }.tag(1)
            NavigationStack { CloudHelpView() }.tabItem { Label("Info", systemImage: "info.circle") }.tag(2)
        }
        .tint(Morph.accent)
        .task { updatePolling() }
        .onChange(of: scenePhase) { _, _ in updatePolling() }
        .onChange(of: selectedTab) { _, _ in updatePolling() }
    }
    private func updatePolling() { store.setActive(scenePhase == .active && selectedTab == 0) }
}

@MainActor
struct CloudJobsView: View {
    @ObservedObject var store: CloudStore
    @State private var path: [String] = []
    @State private var showingConnection = false
    @State private var showingCreation = false
    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("RED LOOP / CLOUD").font(.caption.monospaced()).foregroundStyle(.secondary)
                    Text("Deine\nAufträge.").font(.system(.largeTitle, design: .serif).weight(.semibold)).tracking(-0.5)
                    Text("Der Server arbeitet weiter, auch wenn du die App schließt.").font(.subheadline).foregroundStyle(.secondary)
                    if !store.hasConnection {
                        GlassPanel {
                            Label("Server verbinden", systemImage: "server.rack").font(.headline)
                            Text("Richte deinen RED-Loop-Server und seinen Zugangstoken ein. Erst danach werden echte Aufträge geladen.").foregroundStyle(.secondary)
                            Button("Verbindung einrichten") { showingConnection = true }.buttonStyle(.borderedProminent).frame(minHeight: 44)
                        }
                    } else {
                        connectionSummary
                        Button { showingCreation = true } label: {
                            Label("Neuer Auftrag", systemImage: "plus").frame(maxWidth: .infinity, minHeight: 44)
                        }.buttonStyle(.borderedProminent).disabled(!store.canCreateJob)
                        if store.isLoading && store.serviceStatus == nil { ProgressView("Aufträge laden …").frame(maxWidth: .infinity) }
                        if store.jobs.isEmpty && store.serviceStatus != nil {
                            GlassPanel {
                                Text("Noch keine Aufträge").font(.headline)
                                Text("Erstelle einen Auftrag mit klarer Zielbeschreibung. Fortschritt und Ergebnisse erscheinen hier.").foregroundStyle(.secondary)
                            }
                        }
                        ForEach(store.jobs) { job in
                            NavigationLink(value: job.id) {
                                GlassPanel {
                                    HStack(alignment: .top, spacing: 16) {
                                        VStack(alignment: .leading, spacing: 8) {
                                            Text(job.title).font(.headline).foregroundStyle(.primary)
                                            JobStatusLabel(job: job)
                                        }
                                        Spacer(minLength: 0)
                                        Text("\(job.stepCount)/\(job.maxSteps)").font(.title3.monospacedDigit()).foregroundStyle(Morph.accent)
                                    }
                                    if !job.summary.isEmpty { Text(job.summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(3) }
                                    HStack { Text("Bis \(job.maxDurationMinutes) Min."); Spacer(); Image(systemName: "chevron.right") }.font(.caption).foregroundStyle(.secondary)
                                }
                            }.buttonStyle(.plain)
                        }
                    }
                    if let message = store.errorMessage { CloudErrorPanel(message: message) { Task { await store.refresh() } } }
                }.padding(24).frame(maxWidth: 760).frame(maxWidth: .infinity)
            }
            .background(Color("Canvas"))
            .refreshable { await store.refresh() }
            .navigationTitle("RED Loop").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Verbindung", systemImage: "server.rack") { showingConnection = true } } }
            .navigationDestination(for: String.self) { CloudJobDetailView(store: store, jobID: $0) }
            .sheet(isPresented: $showingConnection) { CloudConnectionView(store: store) }
            .sheet(isPresented: $showingCreation) { CloudCreateJobView(store: store) { path.append($0) } }
        }
    }
    @ViewBuilder private var connectionSummary: some View {
        GlassPanel {
            if let status = store.serviceStatus {
                Label(store.errorMessage == nil ? "Server verbunden" : "Aktualisierung fehlgeschlagen", systemImage: store.errorMessage == nil ? "checkmark.circle" : "exclamationmark.triangle").font(.headline)
                Text(store.serverAddress).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                Text("KI-Dienst: \(status.provider) · Server \(status.version)").font(.caption).foregroundStyle(.secondary)
                if !status.configured { Label("Der KI-Dienst ist auf dem Server noch nicht eingerichtet. Neue Aufträge sind noch nicht verfügbar.", systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Morph.accent) }
                if let updated = store.lastUpdated { Text("Letzter Stand: \(updated.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary) }
            } else {
                Label(store.isLoading ? "Verbindung wird geprüft" : "Serverstatus nicht verfügbar", systemImage: "server.rack").font(.headline)
                Text(store.serverAddress).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct JobStatusLabel: View {
    let job: CloudJob
    private var symbol: String {
        switch job.status {
        case "completed": return "checkmark.circle"
        case "running", "queued": return "arrow.triangle.2.circlepath"
        case "paused": return "pause.circle"
        case "needs_input": return "questionmark.circle"
        case "failed": return "exclamationmark.triangle"
        default: return "stop.circle"
        }
    }
    var body: some View { Label(job.statusTitle, systemImage: symbol).font(.subheadline).foregroundStyle(job.status == "running" || job.status == "needs_input" ? Morph.accent : Color.secondary) }
}

struct CloudErrorPanel: View {
    let message: String
    var retry: (() -> Void)? = nil
    var body: some View {
        GlassPanel {
            Label(message, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Morph.accent).textSelection(.enabled)
            if let retry = retry { Button("Erneut aktualisieren", action: retry).frame(minHeight: 44) }
        }
    }
}

@MainActor
struct CloudConnectionView: View {
    @ObservedObject var store: CloudStore
    @Environment(\.dismiss) private var dismiss
    @State private var server: String
    @State private var token = ""
    @State private var error: String?
    @State private var confirmingRemoval = false
    init(store: CloudStore) { self.store = store; _server = State(initialValue: store.serverAddress) }
    var body: some View {
        NavigationStack {
            Form {
                Section("RED-Loop-Server") {
                    TextField("HTTPS-Serveradresse", text: $server).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("Server-Zugangstoken", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("Verwende den Zugangstoken deines RED-Loop-Servers, kein ChatGPT-Passwort und keinen KI-Anbieter-Schlüssel. Adresse und Token werden im iOS-Schlüsselbund gespeichert.").font(.caption).foregroundStyle(.secondary)
                    if store.hasConnection { Text("Zum Ändern der Verbindung den Token erneut eingeben. Bestehende Serveraufträge werden dadurch nicht gestoppt.").font(.caption).foregroundStyle(.secondary) }
                }
                Section {
                    Button {
                        Task {
                            do { try await store.connect(server: server, token: token); token = ""; dismiss() }
                            catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        HStack { if store.isMutating { ProgressView() }; Text("Verbindung prüfen und speichern") }.frame(minHeight: 44)
                    }.disabled(store.isMutating || token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let error = error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Morph.accent) }
                }
                if let status = store.serviceStatus {
                    Section("Letzter Serverstatus") {
                        LabeledContent("Dienst", value: status.service)
                        LabeledContent("Version", value: status.version)
                        LabeledContent("KI-Anbieter", value: status.provider)
                        LabeledContent("KI eingerichtet", value: status.configured ? "Ja" : "Nein")
                        ForEach(status.capabilities, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                    }
                }
                Section("Übertragung") {
                    Text("Beim Erstellen eines Cloud-Auftrags werden Titel und Auftragstext an diesen Server gesendet und dort mit Schritten und Artefakten gespeichert. Der konfigurierte KI-Anbieter verarbeitet den Auftrag.")
                }
                if store.hasConnection {
                    Section { Button("Verbindung von diesem Gerät entfernen", role: .destructive) { confirmingRemoval = true }.disabled(store.isMutating) }
                }
            }
            .navigationTitle("Verbindung").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { token = ""; dismiss() }.disabled(store.isMutating) } }
            .confirmationDialog("Verbindung entfernen? Serveraufträge laufen weiter.", isPresented: $confirmingRemoval) {
                Button("Verbindung entfernen", role: .destructive) {
                    do { try store.disconnect(); token = ""; dismiss() } catch { self.error = error.localizedDescription }
                }
            }
        }.tint(Morph.accent)
    }
}

@MainActor
struct CloudCreateJobView: View {
    @ObservedObject var store: CloudStore
    var onCreated: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var prompt = ""
    @State private var maxSteps = 10
    @State private var maxMinutes = 60
    @State private var error: String?
    private var draft: CloudJobDraft { CloudJobDraft(title: title.trimmingCharacters(in: .whitespacesAndNewlines), prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines), maxSteps: maxSteps, maxDurationMinutes: maxMinutes) }
    var body: some View {
        NavigationStack {
            Form {
                Section("Auftrag") {
                    TextField("Titel", text: $title)
                    Text("\(title.utf16.count) / 120 Zeichen").font(.caption).foregroundStyle(title.utf16.count > 120 ? Morph.accent : Color.secondary)
                    TextEditor(text: $prompt).frame(minHeight: 180).accessibilityLabel("Auftragsbeschreibung")
                    Text("\(prompt.utf16.count) / 20.000 Zeichen · Beschreibe Ziel, gewünschtes Ergebnis und Grenzen.").font(.caption).foregroundStyle(prompt.utf16.count > 20000 ? Morph.accent : Color.secondary)
                }
                Section("Grenzen") {
                    Stepper("Maximal \(maxSteps) Schritte", value: $maxSteps, in: 1...50)
                    Picker("Maximale Dauer", selection: $maxMinutes) {
                        ForEach([1, 15, 30, 60, 120, 240, 480], id: \.self) { minutes in Text(minutes == 1 ? "1 Minute" : "\(minutes) Minuten").tag(minutes) }
                    }
                    Text("Der Server führt den Auftrag innerhalb dieser Grenzen aus. App schließen oder in den Hintergrund wechseln stoppt den Auftrag nicht.").font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Text("Titel und Auftrag werden an deinen Server und dessen KI-Dienst übertragen. Schritte und Ergebnisse bleiben auf dem Server abrufbar.").font(.caption).foregroundStyle(.secondary)
                    Button {
                        Task {
                            do { let job = try await store.create(draft); onCreated(job.id); dismiss() }
                            catch { self.error = error.localizedDescription }
                        }
                    } label: { HStack { if store.isMutating { ProgressView() }; Label("Cloud-Auftrag starten", systemImage: "arrow.up.circle") }.frame(minHeight: 44) }
                    .disabled(!draft.isValid || !store.canCreateJob)
                    if let error = error { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Morph.accent) }
                }
            }
            .navigationTitle("Neuer Auftrag").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() }.disabled(store.isMutating) } }
        }.tint(Morph.accent)
    }
}

@MainActor
struct CloudJobDetailView: View {
    @ObservedObject var store: CloudStore
    let jobID: String
    @Environment(\.scenePhase) private var scenePhase
    @State private var detail: CloudJobDetail?
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let detail = detail {
                    GlassPanel {
                        JobStatusLabel(job: detail.job)
                        Text(detail.job.title).font(.system(.title, design: .serif).weight(.semibold))
                        HStack(alignment: .firstTextBaseline) {
                            Text("\(detail.job.stepCount)").font(.system(size: 52, weight: .light, design: .rounded)).monospacedDigit()
                            Text("von \(detail.job.maxSteps) Schritten").foregroundStyle(.secondary)
                        }
                        ProgressView(value: Double(detail.job.stepCount), total: Double(max(1, detail.job.maxSteps))).accessibilityLabel("Schritte").accessibilityValue("\(detail.job.stepCount) von \(detail.job.maxSteps)")
                        Text("Zeitlimit: \(detail.job.maxDurationMinutes) Minuten").font(.caption).foregroundStyle(.secondary)
                        if !detail.job.summary.isEmpty { Text(detail.job.summary).textSelection(.enabled) }
                        if let message = detail.job.error { Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(Morph.accent).textSelection(.enabled) }
                        ViewThatFits { HStack { controls(detail.job) }; VStack { controls(detail.job) } }
                        if detail.job.canStop { Text("Eine laufende Bearbeitung kann noch ausklingen. Der Server bestätigt den jeweiligen Zustand.").font(.caption).foregroundStyle(.secondary) }
                    }
                    GlassPanel {
                        DisclosureGroup("Ursprünglicher Auftrag") { Text(detail.job.prompt).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8) }
                    }
                    if !detail.steps.isEmpty {
                        GlassPanel {
                            Text("Arbeitsschritte").font(.headline)
                            ForEach(detail.steps) { step in
                                DisclosureGroup {
                                    Text(step.output).font(.subheadline).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) { Text("Schritt \(step.index) · \(step.summary)"); Text(step.status).font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                        }
                    }
                    if !detail.artifacts.isEmpty {
                        GlassPanel {
                            Text("Artefakte").font(.headline)
                            ForEach(detail.artifacts) { artifact in
                                NavigationLink { CloudArtifactView(store: store, jobID: jobID, artifact: artifact) } label: { Label(artifact.name, systemImage: "doc.text").frame(minHeight: 44) }
                            }
                        }
                    }
                } else if loading { ProgressView("Auftrag laden …").frame(maxWidth: .infinity) }
                if let error = error { CloudErrorPanel(message: error) { Task { await reload() } } }
            }.padding(24).frame(maxWidth: 760).frame(maxWidth: .infinity)
        }
        .background(Color("Canvas"))
        .navigationTitle("Auftrag").navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button("Aktualisieren", systemImage: "arrow.clockwise") { Task { await reload() } }.disabled(loading) }
            ToolbarItem(placement: .topBarTrailing) { if let detail = detail { ShareLink(item: detail.exportText) { Label("Exportieren", systemImage: "square.and.arrow.up") } } }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled { await reload(); do { try await Task.sleep(nanoseconds: 8_000_000_000) } catch { return } }
        }
    }
    @ViewBuilder private func controls(_ job: CloudJob) -> some View {
        if job.canPause { Button("Pause", systemImage: "pause") { change(.pause) }.buttonStyle(.bordered).frame(minHeight: 44).disabled(store.isMutating) }
        if job.canResume { Button("Fortsetzen", systemImage: "play") { change(.resume) }.buttonStyle(.borderedProminent).frame(minHeight: 44).disabled(store.isMutating) }
        if job.canStop { Button(role: .destructive) { change(.stop) } label: { Label("Stoppen", systemImage: "stop") }.buttonStyle(.bordered).frame(minHeight: 44).disabled(store.isMutating) }
    }
    private func change(_ action: CloudJobAction) {
        Task { do { _ = try await store.control(id: jobID, action: action); await reload() } catch { self.error = error.localizedDescription } }
    }
    private func reload() async {
        guard !loading else { return }
        loading = true; defer { loading = false }
        do { let value = try await store.detail(id: jobID); guard !Task.isCancelled else { return }; detail = value; error = nil }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

@MainActor
struct CloudArtifactView: View {
    @ObservedObject var store: CloudStore
    let jobID: String
    let artifact: CloudArtifact
    @State private var content: String?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let text = content ?? artifact.content { Text(text).font(.system(.body, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                else if let error = error { CloudErrorPanel(message: error) { Task { await load() } } }
                else { ProgressView("Artefakt laden …") }
            }.padding(24)
        }.background(Color("Canvas")).navigationTitle(artifact.name).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { if let text = content ?? artifact.content { ShareLink(item: text) { Label("Teilen", systemImage: "square.and.arrow.up") } } } }
        .task { if artifact.content == nil { await load() } }
    }
    private func load() async {
        error = nil
        do { content = try await store.artifact(id: jobID, name: artifact.name) }
        catch is CancellationError { }
        catch { self.error = error.localizedDescription }
    }
}

struct CloudHelpView: View {
    var body: some View {
        List {
            Section("Cloud-Aufträge") {
                Text("1. Im Tab Aufträge die Verbindung öffnen und HTTPS-Serveradresse sowie RED-Loop-Zugangstoken eingeben.")
                Text("2. Verbindung prüfen, einen Auftrag mit Ziel und Grenzen erstellen und starten.")
                Text("3. Die App darf geschlossen werden. Der Server führt den Auftrag aus; beim nächsten Öffnen werden Zustand, Schritte und Artefakte neu geladen.")
                Text("Pause, Fortsetzen und Stoppen werden ausdrücklich an den Server gesendet. App schließen pausiert keinen Auftrag.")
            }
            Section("Getrennte Funktionen") {
                Text("Cloud-Aufträge nutzen den auf dem Server eingerichteten KI-Dienst. Sie steuern keinen vorhandenen ChatGPT- oder Safari-Chat.")
                Text("Die lokale Demo simuliert Abläufe ohne Server. Die Safari-Erweiterung hat ihre eigene browserbasierte Steuerung.")
                NavigationLink("Safari-Erweiterung aktivieren") { ActivationView() }
                NavigationLink("Datenschutz und Speicherung") { PrivacyView() }
            }
            Section("Installation und Verbindung") {
                Text("Die native App benötigt eine signierte Installation über Xcode oder eine bereitgestellte TestFlight-/Installationsversion. Diese App kann keine Signierung oder Safari-Websitefreigabe erteilen.")
                Text("Bei Zugang verweigert den Server-Zugangstoken prüfen. Ist der KI-Dienst nicht eingerichtet, muss der Serverbetreiber dessen Konfiguration ergänzen. Ein Browser-Login ersetzt den Server-Zugangstoken nicht.")
            }
        }.navigationTitle("Info")
    }
}

#Preview { CloudRootView() }
