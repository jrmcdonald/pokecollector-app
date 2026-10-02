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
    // Times on screen (a scan's, say) are shown in the phone's time zone; one
    // zone everywhere, so a local run matches CI's approved screenshots.
    app.launchEnvironment["TZ"] = "UTC"
    outputDir = URL(fileURLWithPath: output, isDirectory: true)
    try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
    try "screen\ttype\tissue\telement\tframe\n"
      .write(to: auditFile, atomically: true, encoding: .utf8)
  }

  func testWalkthrough() throws {
    app.launch()
    signIn()

    // Home, then into the collection and one card.
    wait(for: element(startingWith: "Collection value"), "Home")
    capture("home")

    let entries = app.staticTexts.matching(NSPredicate(format: "label ENDSWITH ' entries'"))
    go(button(startingWith: "Browse your collection"), to: entries.firstMatch, "Collection")
    capture("collection-grid")
    go(app.navigationBars.buttons["Show as list"], to: button(startingWith: "Charizard ex"), "Collection as a list")
    capture("collection-list")

    go(button(startingWith: "Charizard ex"), to: app.staticTexts["Charizard ex"].firstMatch, "Card")
    capture("card")
    scrollToEnd()
    // The scroll indicator stays a moment after the scroll stops, then fades.
    // Holding still, it can pass for a settled screen, so let it go first.
    Thread.sleep(forTimeInterval: 3.0)
    capture("card-scrolled")
    back(to: button(startingWith: "Charizard ex"), "Collection, again")
    back(to: button(startingWith: "Browse your collection"), "Home, again")

    let field = app.textFields["Search the catalogue"]
    go(app.tabBars.buttons["Search"], to: field, "Search")
    capture("search")
    type("pika", into: field, slowly: true)
    // The count, not a Pikachu: typed slowly, the search can go out for "pi"
    // first, and those results have Pikachus too, among Pidgey and Caterpie.
    // Only "pika" finds exactly the fake server's four.
    let results = element(startingWith: "4 cards")
    if !results.waitForExistence(timeout: 10) {
      // At the largest text size a run has shown "pika" in the field with the
      // screen still empty and no search sent: the app had not taken in what
      // was typed. Once more, as a person would.
      type("pika", into: field, slowly: true)
    }
    wait(for: results, "Search results")
    capture("search-results")

    // No camera on the simulator, and the permission is never granted, so
    // this is the explanation shown before asking.
    go(app.tabBars.buttons["Scan"], to: element(startingWith: "Camera access"), "Scan")
    capture("scan")

    // A batch sent earlier and left for later (see the fake server's
    // fixtures): the list, the review, and one photo opened. Reviewing needs
    // no camera, so it is reachable from here too.
    go(button(startingWith: "5 scanned cards to review"), to: button(startingWith: "6 photos"), "Scans to review")
    capture("scans")
    go(button(startingWith: "6 photos"), to: button(startingWith: "Photo 1, Pikachu"), "Scan review")
    capture("scan-review")
    go(button(startingWith: "Photo 1, Pikachu"), to: app.buttons["Done"], "A scanned photo")
    capture("scan-photo")
    tap(app.buttons["Done"])
    back(to: button(startingWith: "6 photos"), "Scans to review, again")
    back(to: button(startingWith: "5 scanned cards to review"), "Scan, again")

    go(app.tabBars.buttons["Binders"], to: button(startingWith: "151 master set"), "Binders")
    capture("binders")
    go(button(startingWith: "151 master set"), to: button(startingWith: "Bulbasaur"), "Planned binder")
    capture("binder")
    back(to: button(startingWith: "151 master set"), "Binders, again")

    go(app.tabBars.buttons["More"], to: button(startingWith: "Wishlist"), "More")
    capture("more")

    go(button(startingWith: "Wishlist"), to: element(startingWith: "To buy everything"), "Wishlist")
    capture("wishlist")
    back(to: button(startingWith: "Sets"), "More, again")

    go(button(startingWith: "Sets"), to: button(startingWith: "151, "), "Sets")
    capture("sets")
    go(button(startingWith: "151, "), to: button(startingWith: "Bulbasaur"), "Set checklist")
    capture("set")
    back(to: button(startingWith: "151, "), "Sets, again")
    back(to: button(startingWith: "Decks"), "More, again")

    // A planned deck with cards missing, and the paste screen for adding a
    // prebuilt one (looking cards up writes, which the fake server refuses).
    go(button(startingWith: "Decks"), to: button(startingWith: "Lost Box"), "Decks")
    capture("decks")
    go(button(startingWith: "Lost Box"), to: button(startingWith: "Roaring Moon ex"), "Deck")
    capture("deck")
    back(to: button(startingWith: "Lost Box"), "Decks, again")
    go(app.navigationBars.buttons["Add a prebuilt deck"], to: app.textFields["Deck name"], "Add a prebuilt deck")
    capture("deck-import")
    back(to: button(startingWith: "Lost Box"), "Decks, again")
    back(to: button(startingWith: "Settings"), "More, again")

    go(button(startingWith: "Settings"), to: button(startingWith: "Server and login"), "Settings")
    capture("settings")
    go(button(startingWith: "Server and login"), to: element(startingWith: "Using the"), "Server and login")
    capture("connection")

    if !findings.isEmpty {
      XCTFail("The accessibility audit found \(findings.count) issues; see audit.tsv")
    }
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
    if tabs.exists { return }
    if !primary.exists {
      diagnose("The app did not start")
      XCTFail("The app did not start: neither onboarding nor the tabs appeared")
      return
    }
    capture("onboarding")

    type(serverURL, into: primary)
    type(username, into: app.textFields["PokeCollector username"])
    type(password, into: app.secureTextFields["PokeCollector password"])
    tap(app.buttons["Connect"])
    // The first connection on a freshly booted simulator can outlast the
    // app's eight-second connection test; try again, as a person would.
    let unreachable = element(startingWith: "Could not reach the server")
    var retries = 0
    let signedIn = Date().addingTimeInterval(60)
    while Date() < signedIn, !tabs.exists {
      dismissSystemSheets()
      if unreachable.exists, retries < 2 {
        retries += 1
        tap(app.buttons["Connect"])
        // The message stays up while the next test runs; wait for it to go,
        // so one failure is not counted again and the retry gets its chance.
        _ = unreachable.waitForNonExistence(timeout: 10)
      }
      Thread.sleep(forTimeInterval: 0.5)
    }
    if !tabs.exists {
      diagnose("Onboarding did not finish")
      XCTFail("Onboarding did not finish")
    }
    // iOS offers to save the password a moment after the app has moved on,
    // over the top of it.
    if app.buttons["Not Now"].waitForExistence(timeout: 8) { dismissSystemSheets() }
  }

  /// Sheets iOS shows on a fresh simulator that cover the app: the offer to
  /// save the password after signing in, and the keyboard's first-use tip.
  @discardableResult
  private func dismissSystemSheets() -> Bool {
    var dismissed = false
    for owner in [app!, springboard] {
      for label in ["Not Now", "Continue"] {
        let button = owner.buttons[label]
        if button.exists, button.isHittable {
          button.tap()
          dismissed = true
        }
      }
    }
    return dismissed
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
    // On a slow runner the offer to save the password can come later than
    // signIn waits for it, over whatever screen is next.
    dismissSystemSheets()
    // No screenshot is of a keyboard. On a slow runner one has been found
    // open over Server and login, the form scrolled to make room for it.
    // Return closes it, as in type().
    if app.keyboards.firstMatch.exists {
      // Said in the log, with what had focus: what opens it is not known yet.
      let focused = app.descendants(matching: .any)
        .matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
      let what = focused.exists ? "\(focused.elementType.rawValue) '\(focused.label)'" : "nothing"
      print("CAPTURE\t\(name)\ta keyboard was open; focus on \(what)")
      app.typeText("\n")
      if !app.keyboards.firstMatch.waitForNonExistence(timeout: 5) {
        print("CAPTURE\t\(name)\tthe keyboard stayed open")
      }
    }
    let shot = settledScreenshot()
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

  /// The screen once it stops changing: card images load, and lists settle
  /// after scrolling, in their own time. A fixed second once caught the card
  /// screen before its image arrived. First any spinner goes, then two
  /// identical frames a second apart count as settled; a screen that never
  /// settles (a blinking cursor) is taken after ten seconds. A system sheet
  /// that slides in meanwhile is dismissed, and the settling starts again.
  /// Few frames: screenshots are slow on a busy runner, and XCUITest has
  /// timed out asking for one.
  private func settledScreenshot() -> XCUIScreenshot {
    let spinning = app.activityIndicators.firstMatch
    if spinning.exists { _ = spinning.waitForNonExistence(timeout: 10) }
    Thread.sleep(forTimeInterval: 1.0)
    var shot = XCUIScreen.main.screenshot()
    let deadline = Date().addingTimeInterval(10)
    while Date() < deadline {
      Thread.sleep(forTimeInterval: 1.0)
      if dismissSystemSheets() {
        Thread.sleep(forTimeInterval: 1.0)
        shot = XCUIScreen.main.screenshot()
        continue
      }
      let next = XCUIScreen.main.screenshot()
      if next.pngRepresentation == shot.pngRepresentation { return next }
      shot = next
    }
    return shot
  }

  /// Apple's audit: contrast, hit regions, labels, traits, Dynamic Type,
  /// clipped text. Issues are collected rather than failing at once, so one
  /// run lists them all.
  private func audit(_ screen: String) {
    // Element detection works from the screen image, and text caught mid
    // fade or mid layout can trip it once. A screen with issues is audited
    // again after settling, and only issues found both times are recorded.
    let first = auditPass(screen)
    guard !first.isEmpty else { return }
    // The issues that came and went were text found in the screen's pixels
    // with no element, on screens of card images. Settled, not a fixed wait.
    _ = settledScreenshot()
    // Compared without the frame: a reproducible issue on an element that
    // moved by a point between passes is still the same issue.
    let seen = Set(first.map { $0.dropLast().joined(separator: "\t") })
    let second = auditPass(screen)
    for issue in second where seen.contains(issue.dropLast().joined(separator: "\t")) {
      record(issue)
    }
  }

  private func auditPass(_ screen: String) -> [[String]] {
    var issues: [[String]] = []
    do {
      try app.performAccessibilityAudit(for: .all) { issue in
        let element = issue.element
        let label = [element?.label, element?.identifier]
          .compactMap { $0 }
          .first { !$0.isEmpty } ?? "(no label)"
        let frame = element.map { String(describing: $0.frame) } ?? ""
        issues.append([screen, Self.name(of: issue.auditType), issue.compactDescription, label, frame])
        return true
      }
    } catch {
      issues.append([screen, "error", "\(error)", "", ""])
    }
    return issues
  }


  /// Writes a finding out at once: a step that fails later ends the test
  /// there, and what was found up to then should not be lost with it.
  private func record(_ fields: [String]) {
    let line = fields
      .map { $0.replacingOccurrences(of: "\t", with: " ").replacingOccurrences(of: "\n", with: " ") }
      .joined(separator: "\t")
    findings.append(line)
    print("AUDIT\t\(line)")
    if let handle = try? FileHandle(forWritingTo: auditFile) {
      handle.seekToEndOfFile()
      handle.write(Data((line + "\n").utf8))
      try? handle.close()
    }
  }

  private var auditFile: URL { outputDir.appendingPathComponent("audit.tsv") }

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

  /// Waits for an element, clearing any system sheet that comes up over the
  /// app meanwhile: iOS's offer to save the password has arrived over Home
  /// a minute after signing in.
  private func wait(for element: XCUIElement, _ what: String, timeout: TimeInterval = 20) {
    let deadline = Date().addingTimeInterval(timeout)
    while !element.waitForExistence(timeout: 1), Date() < deadline {
      dismissSystemSheets()
    }
    if !element.exists {
      diagnose("\(what) did not appear")
      XCTFail("\(what) did not appear")
    }
  }

  /// Taps, and waits for what the tap should show. A system sheet that came
  /// up as it was tapped takes the tap, so once that sheet is dismissed the
  /// tap is made again.
  private func go(_ target: XCUIElement, to expected: XCUIElement, _ what: String) {
    tap(target)
    if !expected.waitForExistence(timeout: 5), dismissSystemSheets(), !expected.exists,
      target.exists
    {
      tap(target)
    }
    wait(for: expected, what)
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
      dismissSystemSheets()
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
  /// start, as is anything asked to be.
  private func type(_ text: String, into field: XCUIElement, slowly: Bool = false) {
    let secure = field.elementType == .secureTextField
    for attempt in 1...3 {
      tap(field)
      _ = app.keyboards.firstMatch.waitForExistence(timeout: 5)
      clear(field)
      if attempt == 1 && !secure && !slowly {
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
    // Put the cursor after the text first: a tap in the middle of it (one
    // run left "https://localhost:8443" growing with each retry) deletes
    // only what comes before.
    field.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 4))
  }

  /// Back one screen, and waits for the screen before it: a second tap during
  /// the animation can land on the outgoing screen's bar, which is still there.
  /// The previous screen is in the tree as soon as the animation starts, and
  /// both bars are during it, so it waits for the navigation bars to change
  /// and then hold still. Not a failure if they never change: a screen
  /// without a title may share its bar's identifier.
  private func back(to previous: XCUIElement, _ what: String) {
    let bars = { self.app.navigationBars.allElementsBoundByIndex.map(\.identifier) }
    let before = bars()
    tap(app.navigationBars.buttons.element(boundBy: 0))
    // A system sheet that came up as it was tapped takes the tap.
    if !previous.waitForExistence(timeout: 5), dismissSystemSheets(), bars() == before {
      tap(app.navigationBars.buttons.element(boundBy: 0))
    }
    var last = before
    let deadline = Date().addingTimeInterval(5)
    while Date() < deadline {
      Thread.sleep(forTimeInterval: 0.5)
      let now = bars()
      if now != before, now == last { break }
      last = now
    }
    wait(for: previous, what)
  }

  /// Scrolls until the screen stops moving, so a scrolled screenshot is of
  /// the end of the content rather than wherever a fling happened to stop.
  private func scrollToEnd() {
    var before = XCUIScreen.main.screenshot().pngRepresentation
    for _ in 0..<5 {
      app.swipeUp(velocity: .slow)
      Thread.sleep(forTimeInterval: 1.0)
      let after = XCUIScreen.main.screenshot().pngRepresentation
      if after == before { return }
      before = after
    }
  }
}
