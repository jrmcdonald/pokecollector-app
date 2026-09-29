import SwiftUI

/// Xcode wants a host app for every UI test bundle. The walkthrough drives
/// PokeCollector itself, by bundle ID, so this never does anything.
@main
struct HostApp: App {
  var body: some Scene {
    WindowGroup { Text("Walkthrough host") }
  }
}
