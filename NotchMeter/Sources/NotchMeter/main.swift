import AppKit

let arguments = CommandLine.arguments
let statusIssue = previewStatusIssue(from: arguments)
if arguments.contains("--print-accessibility-summary") {
    let samplePath = ProcessInfo.processInfo.environment["USAGE_METER_STATUS_PATH"]
        ?? "NotchMeter/Samples/notch-status.json"
    do {
        print(try PreviewRenderer.accessibilitySummary(samplePath: samplePath, issue: statusIssue))
        exit(0)
    } catch {
        fputs("NotchMeter accessibility summary failed: \(error)\n", stderr)
        exit(1)
    }
}

if let previewIndex = arguments.firstIndex(of: "--render-preview") {
    let outputPath = previewIndex + 1 < arguments.count
        ? arguments[previewIndex + 1]
        : "/tmp/notchmeter-preview.png"
    let samplePath = ProcessInfo.processInfo.environment["USAGE_METER_STATUS_PATH"]
        ?? "NotchMeter/Samples/notch-status.json"
    let includesBackdrop = arguments.contains("--preview-backdrop")
    let hoverTarget = previewHoverTarget(from: arguments)
    do {
        try PreviewRenderer.render(
            samplePath: samplePath,
            outputPath: outputPath,
            includesBackdrop: includesBackdrop,
            hoverTarget: hoverTarget,
            issue: statusIssue
        )
        exit(0)
    } catch {
        fputs("NotchMeter preview failed: \(error)\n", stderr)
        exit(1)
    }
}

func previewHoverTarget(from arguments: [String]) -> PreviewHoverTarget? {
    guard let hoverIndex = arguments.firstIndex(of: "--preview-hover"),
          hoverIndex + 1 < arguments.count else {
        return nil
    }
    return PreviewHoverTarget(rawValue: arguments[hoverIndex + 1])
}

func previewStatusIssue(from arguments: [String]) -> UsageStatusIssue? {
    guard let issueIndex = arguments.firstIndex(of: "--preview-issue"),
          issueIndex + 1 < arguments.count else {
        return nil
    }
    return UsageStatusIssue(rawValue: arguments[issueIndex + 1])
}

let app = NSApplication.shared
let delegate = AppDelegate()

app.delegate = delegate
app.run()
