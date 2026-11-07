import SwiftUI

enum Morph {
    static let accent = Color("AccentColor")
    static let spacing: CGFloat = 24
}

struct GlassPanel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 16) { content }
            .padding(Morph.spacing).frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(.primary.opacity(0.12), lineWidth: 1))
    }
}

struct LocalDemoView: View {
    @StateObject private var model = LoopModel()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("RED MORPH / LOKALE DEMO").font(.caption.monospaced()).foregroundStyle(.secondary)
                    Text("Kontrollierter\nFortschritt.").font(.largeTitle.weight(.medium)).tracking(-1)
                    Label("Simulation auf diesem Gerät", systemImage: "iphone").font(.caption).foregroundStyle(Morph.accent)
                    GlassPanel {
                        Text("Loop-Steuerung").font(.headline)
                        VStack(spacing: 8) {
                            Text(model.count, format: .number).font(.system(size: 72, weight: .light, design: .rounded)).monospacedDigit()
                                .contentTransition(.numericText()).accessibilityLabel("\(model.count) von \(model.limit) Fortsetzungen")
                            Text(model.status.rawValue).font(.subheadline)
                        }.frame(maxWidth: .infinity).padding(.vertical, 16)
                        ProgressView(value: Double(model.count), total: Double(max(1, model.limit)))
                            .accessibilityLabel("Fortschritt").accessibilityValue("\(model.count) von \(model.limit)")
                        Stepper("Limit: \(model.limit)", value: $model.limit, in: 1...50).disabled(model.isRunning)
                        Picker("Testszenario", selection: $model.scenario) {
                            ForEach(LoopModel.Scenario.allCases) { scenario in Text(scenario.rawValue).tag(scenario) }
                        }.disabled(model.isRunning)
                        if let error = model.errorMessage { Label(error, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Morph.accent) }
                        ViewThatFits { HStack(spacing: 12) { controls }; VStack(spacing: 12) { controls } }
                        Button("Zurücksetzen", action: model.reset).frame(minHeight: 44).frame(maxWidth: .infinity)
                        Text("Diese Demo sendet keine Aufträge. Echte Cloud-Aufträge erstellst du im Tab Aufträge; die Safari-Erweiterung wird separat im Browser bedient.").font(.caption).foregroundStyle(.secondary)
                    }
                    GlassPanel {
                        Text("Demo-Aktivität").font(.headline)
                        if model.events.isEmpty { Text("Dein nächster Test beginnt hier.").foregroundStyle(.secondary) }
                        ForEach(Array(model.events.enumerated()), id: \.offset) { _, message in Text(message).font(.subheadline).padding(.vertical, 4) }
                    }
                }.padding(24).frame(maxWidth: 700).frame(maxWidth: .infinity)
            }.background(Color("Canvas")).navigationTitle("Lokale Demo").navigationBarTitleDisplayMode(.inline)
        }
        .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: model.status)
        .onChange(of: scenePhase) { _, phase in if phase != .active { model.stop() } }
        .onDisappear { model.stop() }
    }
    @ViewBuilder private var controls: some View {
        Button(action: { model.start() }) { Label("Demo starten", systemImage: "play.fill").frame(maxWidth: .infinity, minHeight: 44) }
            .buttonStyle(.borderedProminent).disabled(model.isRunning)
        Button(action: model.stop) { Label("Stopp", systemImage: "stop.fill").frame(maxWidth: .infinity, minHeight: 44) }
            .buttonStyle(.bordered).disabled(!model.isRunning)
    }
}

struct ActivationView: View {
    var body: some View {
        List {
            Section("Erweiterung aktivieren") {
                Label("Zugriff in Safari prüfen", systemImage: "questionmark.circle")
                Text("Die App kann den Website-Zugriff unter iOS nicht zuverlässig abfragen. Prüfe die Freigabe direkt in Safari.")
                Text("1. Einstellungen → Apps → Safari → Erweiterungen → RED Loop aktivieren. Bei älteren Versionen: Einstellungen → Safari.")
                Text("2. Safari öffnen und den Zugriff der Erweiterung auf chatgpt.com erlauben.")
                Text("3. Bestehende Konversation mit einer Antwort öffnen. Im RED-Loop-Panel Limit wählen und Start drücken.")
                Link("ChatGPT in Safari öffnen", destination: URL(string: "https://chatgpt.com/")!)
            }
            Section("Wenn das Panel fehlt") {
                Text("Website-Freigabe und Erweiterung prüfen, dann die Seite neu laden. Bei verändertem ChatGPT-Layout kann eine Anpassung erforderlich sein.")
            }
            Section("Klare Grenzen") {
                Text("Die Safari-Erweiterung ist von Cloud-Aufträgen getrennt. iOS kann Safari im Hintergrund anhalten; bei gesperrtem iPhone ist kein Browserlauf zugesichert. Für Arbeit nach dem Schließen der App Cloud-Aufträge verwenden.")
                Text("Die native Demo und Safari besitzen getrennte Zähler. Start/Stopp der App gelten ausschließlich für die Demo.")
            }
        }.navigationTitle("Safari aktivieren")
    }
}

struct PrivacyView: View {
    var body: some View {
        List {
            Section("Cloud-Aufträge") {
                Text("Beim Erstellen eines Auftrags werden Titel und Auftragstext an deinen RED-Loop-Server gesendet. Der Server speichert Auftrag, Schritte und Artefakte; sein konfigurierter KI-Anbieter verarbeitet die Inhalte. Gib nur Daten ein, die du dort verarbeiten lassen möchtest.")
                Text("Serveradresse und Zugangstoken werden im iOS-Schlüsselbund dieses Geräts gespeichert. Die App enthält keinen KI-Anbieter-Schlüssel und protokolliert keine Zugangstokens. Entfernen der Verbindung löscht keine Serveraufträge.")
            }
            Section("Lokale Demo und Safari") {
                Text("Die lokale Demo hält ihre Zähler und Ereignisse nur im Arbeitsspeicher. Sie überträgt keine Aufträge. Die Safari-Erweiterung steuert separat die ChatGPT-Oberfläche.")
                Text("Die Erweiterung liest Antworten lokal und speichert Zähler, Limits, deinen Folgetext und die Hintergrund-Einstellung pro Chat im Sitzungsspeicher des Tabs. Der Folgetext wird nach deinem Start über die ChatGPT-Oberfläche an ChatGPT gesendet.")
            }
            Section("Deine Kontrolle") {
                Text("Cloud-Aufträge starten ausdrücklich mit höchstens 50 Schritten und 480 Minuten. Sie laufen serverseitig nach dem Schließen der App weiter. Pause, Fortsetzen und Stoppen sind Serveraktionen. Die Nutzung des eingerichteten KI-Dienstes kann dessen Kontingent verbrauchen.")
                Text("Diese Testversion ist auf einem echten iPhone noch nicht verifiziert.")
            }
        }.navigationTitle("Datenschutz")
    }
}

#Preview { LocalDemoView() }
