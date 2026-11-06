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

struct DashboardView: View {
    @StateObject private var model = LoopModel()
    @State private var selectedTab = 0
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        Text("BBT RED / RED MORPH").font(.caption.monospaced()).foregroundStyle(.secondary)
                        Text("Kontrollierter\nFortschritt.").font(.largeTitle.weight(.medium)).tracking(-1)
                        Label("Demo-Modus · Lokal auf diesem Gerät", systemImage: "circle.inset.filled").font(.caption).foregroundStyle(Morph.accent)
                        GlassPanel {
                            HStack { Text("Loop-Steuerung").font(.headline); Spacer(); Text("LOKAL").font(.caption.monospaced()).foregroundStyle(.secondary) }
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
                            if let error = model.errorMessage {
                                Label(error, systemImage: "exclamationmark.triangle").font(.subheadline).foregroundStyle(Morph.accent)
                            }
                            ViewThatFits {
                                HStack(spacing: 12) { controls }
                                VStack(spacing: 12) { controls }
                            }
                            Button("Zurücksetzen", action: model.reset).frame(minHeight: 44).frame(maxWidth: .infinity)
                            Text("Simulierte Schritte. Diese App steuert keinen Safari-Tab. Starte echte Fortsetzungen im RED-Loop-Panel auf chatgpt.com.").font(.caption).foregroundStyle(.secondary)
                        }
                        GlassPanel {
                            Text("Aktivität").font(.headline)
                            if model.events.isEmpty { Text("Dein nächster Test beginnt hier.").foregroundStyle(.secondary) }
                            ForEach(Array(model.events.enumerated()), id: \.offset) { _, message in
                                Text(message).font(.subheadline).padding(.vertical, 4)
                            }
                        }
                    }.padding(24).frame(maxWidth: 700).frame(maxWidth: .infinity)
                }.background(Color("Canvas")).navigationTitle("RED Loop").navigationBarTitleDisplayMode(.inline)
            }.tabItem { Label("Dashboard", systemImage: "circle.grid.2x2") }.tag(0)
            NavigationStack { ActivationView() }.tabItem { Label("Safari", systemImage: "safari") }.tag(1)
            NavigationStack { PrivacyView() }.tabItem { Label("Datenschutz", systemImage: "hand.raised") }.tag(2)
        }.tint(Morph.accent)
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: model.status)
            .onChange(of: scenePhase) { _, phase in if phase != .active { model.stop() } }
            .onChange(of: selectedTab) { _, tab in if tab != 0 { model.stop() } }
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
                Text("Nur der sichtbare aktive Tab läuft. Beim Tabwechsel, Seitenwechsel, Entwurf oder Fehler stoppt RED Loop. Kein Hintergrundbetrieb und keine Ausführung bei gesperrtem iPhone.")
                Text("Die native Demo und Safari besitzen getrennte Zähler. Start/Stopp der App gelten ausschließlich für die Demo.")
            }
        }.navigationTitle("Safari aktivieren")
    }
}

struct PrivacyView: View {
    var body: some View {
        List {
            Section("Lokal und begrenzt") {
                Text("Keine Zugangsdaten, kein Analytics-SDK, keine Konversationen an Cloudflare. Die native Demo hält Zähler und Ereignisse nur im Arbeitsspeicher.")
                Text("Die Erweiterung liest Antworten lokal und speichert Zähler, Limits, deinen Folgetext und die Hintergrund-Einstellung pro Chat im Sitzungsspeicher des Tabs. Der Folgetext wird nach deinem Start über die ChatGPT-Oberfläche an ChatGPT gesendet.")
            }
            Section("Deine Kontrolle") {
                Text("Expliziter Start, maximal 50 Fortsetzungen, jederzeit Stopp. Vorhandene Eingaben werden geschützt. Die Nutzung verbraucht ChatGPT-Kontingent und unterliegt den dort geltenden Bedingungen.")
                Text("Diese Testversion ist auf einem echten iPhone noch nicht verifiziert.")
            }
        }.navigationTitle("Datenschutz")
    }
}

#Preview { DashboardView() }
