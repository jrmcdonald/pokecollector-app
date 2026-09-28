import XCTest

/// Walks PokeCollector's main screens against the fake server
/// (`e2e/server`), saving a screenshot of each and running Apple's
/// accessibility audit on it. CI runs this twice: at the default text size,
/// and at the largest accessibility size, where clipped text shows up.
///
/// Settings come from the environment, passed by xcodebuild with a
/// `TEST_RUNNER_` prefix:
///   APP_BUNDLE_ID  the installed PokeCollector build to drive
///   OUTPUT_DIR     where screenshots and `audit.tsv` go (a path on the Mac)
///   SERVER_URL     the fake server, default https://localhost:8443
final class WalkthroughTests: XCTestCase {
  /// The fixture account in `e2e/server/fixtures.ts`. Made up, like all of it.
  private let username = "ash"
  private let password = "pikachu"

  private var app: XCUIApplication!
  private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
  private var outputDir: URL!
  private var serverURL = "https://localhost:8443"
  private var findings: [String] = []

  private struct MissingSetting: Error, CustomStringConvertible {
    let name: String
    var description: String { "Set TEST_RUNNER_\(name) for the walkthrough" }
  }

  override func setUpWithError() throws {
    // A screen that does not appear makes every later step meaningless.
    continueAfterFailure = false
    let env = ProcessInfo.processInfo.environment
    guard let bundleId = env["APP_BUNDLE_ID"] else { throw MissingSetting(name: "APP_BUNDLE_ID") }
    guard let output = env["OUTPUT_DIR"] else { throw MissingSetting(name: "OUTPUT_DIR") }
    if let url = env["SERVER_URL"], !url.isEmpty { serverURL = url }
    app = XCUIApplication(bundleIdentifier: bundleId)
    outputDir = URL(fileURLWithPath: output, isDirectory: true)
    try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
  }

  func testWalkthrough() throws {
    defer { reportFindings() }
    app.launch()
    signIn()

    // Home, then into the collection and one card.
    wait(for: element(startingWith: "Collection value"), "Home")
    capture("home")

    tap(button(startingWith: "Browse your collection"))
    wait(for: app.staticTexts.matching(NSPredicate(format: "label ENDSWITH ' entries'")).firstMatch, "Collection")
    capture("collection-grid")
    tap(app.navigationBars.buttons["Show as list"])
    wait(for: button(startingWith: "Charizard ex"), "Collection as a list")
    capture("collection-list")

    tap(button(startingWith: "Charizard ex"))
    wait(for: app.staticTexts["Charizard ex"].firstMatch, "Card")
    capture("card")
    app.swipeUp()
    capture("card-scrolled")
    back()
    back()

    tab("Search")
    let field = app.textFields["Search the catalogue"]
    wait(for: field, "Search")
    capture("search")
    tap(field)
    field.typeText("pika\n")
    wait(for: button(startingWith: "Pikachu"), "Search results")
    capture("search-results")

    // No camera on the simulator, and the permission is never granted, so
    // this is the explanation shown before asking.
    tab("Scan")
    wait(for: element(startingWith: "Camera access"), "Scan")
    capture("scan")

    tab("Binders")
    wait(for: button(startingWith: "151 master set"), "Binders")
    capture("binders")
    tap(button(startingWith: "151 master set"))
    wait(for: button(startingWith: "Bulbasaur"), "Planned binder")
    capture("binder")
    back()

    tab("More")
    wait(for: button(startingWith: "Wishlist"), "More")
    capture("more")

    tap(button(startingWith: "Wishlist"))
    wait(for: element(startingWith: "To buy everything"), "Wishlist")
    capture("wishlist")
    back()

    tap(button(startingWith: "Sets"))
    wait(for: button(startingWith: "151, "), "Sets")
    capture("sets")
    tap(button(startingWith: "151, "))
    wait(for: button(startingWith: "Bulbasaur"), "Set checklist")
    capture("set")
    back()
    back()

    tap(button(startingWith: "Settings"))
    wait(for: button(startingWith: "Server and login"), "Settings")
    capture("settings")
    tap(button(startingWith: "Server and login"))
    wait(for: element(startingWith: "Using the"), "Server and login")
    capture("connection")
  }

  // MARK: - Steps

  /// Onboarding, unless the Keychain already has an account. CI erases the
  /// simulator before each run, so it always onboards there.
  private func signIn() {
    let primary = app.textFields["Primary address"]
    let tabs = app.tabBars.firstMatch
    let deadline = Date().addingTimeInterval(30)
    while Date() < deadline, !primary.exists, !tabs.exists {
      Thread.sleep(forTimeInterval: 0.25)
    }
    guard primary.exists else { return }
    capture("onboarding")

    type(serverURL, into: primary)
    type(username, into: app.textFields["PokeCollector username"])
    type(password, into: app.secureTextFields["PokeCollector password"])
    tap(app.buttons["Connect"])
    let signedIn = Date().addingTimeInterval(45)
    while Date() < signedIn, !tabs.exists {
      dismissSystemSheets()
      Thread.sleep(forTimeInterval: 0.5)
    }
    if !tabs.exists {
      diagnose("Onboarding did not finish")
      XCTFail("Onboarding did not finish")
    }
  }

  /// Sheets iOS shows on a fresh simulator that cover the app: the offer to
  /// save the password after signing in, and the keyboard's first-use tip.
  private func dismissSystemSheets() {
    for owner in [app!, springboard] {
      for label in ["Not Now", "Continue"] {
        let button = owner.buttons[label]
        if button.exists, button.isHittable { button.tap() }
      }
    }
  }

  /// When a step fails: what was on screen, as a screenshot and as the
  /// accessibility tree of the app and of the system UI over it, in the log.
  private func diagnose(_ what: String) {
    let dir = outputDir.appendingPathComponent("failure", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? XCUIScreen.main.screenshot().pngRepresentation
      .write(to: dir.appendingPathComponent("failure.png"))
    print("DIAGNOSE-BEGIN \(what)")
    print(app.debugDescription)
    print("--- SpringBoard ---")
    print(springboard.debugDescription)
    print("DIAGNOSE-END")
  }

  /// A screenshot for comparison, then the audit of the same screen.
  private func capture(_ name: String) {
    // Card images fade in and lists settle after scrolling.
    Thread.sleep(forTimeInterval: 1.0)
    let shot = XCUIScreen.main.screenshot()
    do {
      try shot.pngRepresentation.write(to: outputDir.appendingPathComponent("\(name).png"))
    } catch {
      XCTFail("Could not save the \(name) screenshot: \(error)")
    }
    let attachment = XCTAttachment(screenshot: shot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
    audit(name)
  }

  /// Apple's audit: contrast, hit regions, labels, traits, Dynamic Type,
  /// clipped text. Issues are collected rather than failing at once, so one
  /// run lists them all.
  private func audit(_ screen: String) {
    do {
      try app.performAccessibilityAudit(for: .all) { issue in
        let element = issue.element
        let label = [element?.label, element?.identifier]
          .compactMap { $0 }
          .first { !$0.isEmpty } ?? "(no label)"
        let frame = element.map { String(describing: $0.frame) } ?? ""
        self.findings.append(
          [screen, Self.name(of: issue.auditType), issue.compactDescription, label, frame]
            .map { $0.replacingOccurrences(of: "\t", with: " ").replacingOccurrences(of: "\n", with: " ") }
            .joined(separator: "\t"))
        return true
      }
    } catch {
      findings.append([screen, "error", "\(error)", "", ""].joined(separator: "\t"))
    }
  }

  private func reportFindings() {
    let lines = ["screen\ttype\tissue\telement\tframe"] + findings
    try? (lines.joined(separator: "\n") + "\n")
      .write(to: outputDir.appendingPathComponent("audit.tsv"), atomically: true, encoding: .utf8)
    for finding in findings { print("AUDIT\t\(finding)") }
    if !findings.isEmpty {
      XCTFail("The accessibility audit found \(findings.count) issues; see audit.tsv")
    }
  }

  private static func name(of type: XCUIAccessibilityAuditType) -> String {
    let names: [(XCUIAccessibilityAuditType, String)] = [
      (.contrast, "contrast"),
      (.elementDetection, "elementDetection"),
      (.hitRegion, "hitRegion"),
      (.sufficientElementDescription, "sufficientElementDescription"),
      (.dynamicType, "dynamicType"),
      (.textClipped, "textClipped"),
      (.trait, "trait"),
    ]
    let matched = names.filter { type.contains($0.0) }.map(\.1)
    return matched.isEmpty ? "other(\(type.rawValue))" : matched.joined(separator: "+")
  }

  // MARK: - Finding and using elements

  private func button(startingWith prefix: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
  }

  private func element(startingWith prefix: String) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(NSPredicate(format: "label BEGINSWITH %@", prefix))
      .firstMatch
  }

  private func wait(for element: XCUIElement, _ what: String, timeout: TimeInterval = 20) {
    if !element.waitForExistence(timeout: timeout) {
      diagnose("\(what) did not appear")
      XCTFail("\(what) did not appear")
    }
  }

  /// Taps, scrolling first when the element is below the fold, as it often
  /// is at the largest text sizes.
  private func tap(_ element: XCUIElement) {
    if !element.waitForExistence(timeout: 20) {
      diagnose("\(element) did not appear")
      XCTFail("\(element) did not appear")
      return
    }
    dismissSystemSheets()
    var swipes = 0
    while !element.isHittable, swipes < 6 {
      app.swipeUp(velocity: .slow)
      swipes += 1
    }
    if !element.isHittable {
      diagnose("\(element) is not hittable")
      XCTFail("\(element) is not hittable")
      return
    }
    element.tap()
  }

  /// Types into a field and checks it took. On a fresh simulator the first
  /// characters can be lost while the keyboard is still appearing (one run
  /// typed "halhost:8443" for "https://localhost:8443"), so it waits for the
  /// keyboard, and retypes a character at a time if the value is wrong. A
  /// secure field's value cannot be read back; it is typed slowly from the
  /// start.
  private func type(_ text: String, into field: XCUIElement) {
    let secure = field.elementType == .secureTextField
    for attempt in 1...3 {
      tap(field)
      _ = app.keyboards.firstMatch.waitForExistence(timeout: 5)
      clear(field)
      if attempt == 1 && !secure {
        field.typeText(text)
      } else {
        for character in text {
          field.typeText(String(character))
          Thread.sleep(forTimeInterval: 0.05)
        }
      }
      if secure || (field.value as? String) == text { break }
      if attempt == 3 {
        diagnose("Typing into \(field) gave \(field.value ?? "nothing")")
        XCTFail("Could not type into \(field)")
      }
    }
    // Return closes the keyboard, so it cannot cover the next field.
    field.typeText("\n")
  }

  /// Deletes what a field holds. An empty field reports its placeholder as
  /// its value, which is left alone.
  private func clear(_ field: XCUIElement) {
    guard let current = field.value as? String, !current.isEmpty,
      current != field.placeholderValue
    else { return }
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
  }

  private func tab(_ name: String) {
    tap(app.tabBars.buttons[name])
  }

  private func back() {
    tap(app.navigationBars.buttons.element(boundBy: 0))
  }
}
