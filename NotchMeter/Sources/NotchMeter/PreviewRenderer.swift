import AppKit
import Foundation

@MainActor
enum PreviewRenderer {
    private static let previewSize = CGSize(width: 660, height: 44)
    private static let previewNotchGapWidth: CGFloat = 132

    static func accessibilitySummary(samplePath: String, issue: UsageStatusIssue? = nil) throws -> String {
        let status = try loadStatus(samplePath: samplePath, issue: issue)
        let view = NotchMeterView(frame: CGRect(origin: .zero, size: previewSize))
        view.notchGapWidth = previewNotchGapWidth
        view.update(status: status, issue: issue)
        return view.accessibilityLabel() ?? ""
    }

    static func render(
        samplePath: String,
        outputPath: String,
        includesBackdrop: Bool = false,
        hoverTarget: PreviewHoverTarget? = nil,
        issue: UsageStatusIssue? = nil
    ) throws {
        let status = try loadStatus(samplePath: samplePath, issue: issue)

        let scale: CGFloat = 2
        let size = previewSize
        let view = NotchMeterView(frame: CGRect(origin: .zero, size: size))
        view.notchGapWidth = previewNotchGapWidth
        view.update(status: status, issue: issue)
        if let hoverPoint = hoverPoint(for: hoverTarget, in: size) {
            view.updateHover(at: hoverPoint)
        }

        guard let representation = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: Int(size.width * scale),
            pixelsHigh: Int(size.height * scale),
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else {
            throw PreviewError.bitmapCreationFailed
        }
        representation.size = size

        guard let context = NSGraphicsContext(bitmapImageRep: representation) else {
            throw PreviewError.contextCreationFailed
        }

        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        if includesBackdrop {
            drawBackdrop(in: CGRect(origin: .zero, size: size), notchGapWidth: view.notchGapWidth)
        }
        view.displayIgnoringOpacity(view.bounds, in: context)
        NSGraphicsContext.restoreGraphicsState()

        guard let png = representation.representation(using: .png, properties: [:]) else {
            throw PreviewError.pngCreationFailed
        }
        try png.write(to: URL(fileURLWithPath: outputPath))
    }

    private static func loadStatus(samplePath: String, issue: UsageStatusIssue?) throws -> NotchStatus? {
        guard issue == nil else {
            return nil
        }

        let data = try Data(contentsOf: URL(fileURLWithPath: samplePath))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(NotchStatus.self, from: data)
    }

    private static func hoverPoint(for target: PreviewHoverTarget?, in size: CGSize) -> CGPoint? {
        guard let target else {
            return nil
        }
        switch target {
        case .left:
            return CGPoint(x: 28, y: size.height / 2)
        case .right:
            return CGPoint(x: size.width - 28, y: size.height / 2)
        case .placeholder:
            return CGPoint(x: 28, y: size.height / 2)
        }
    }

    private static func drawBackdrop(in rect: CGRect, notchGapWidth: CGFloat) {
        NSColor(calibratedWhite: 0.92, alpha: 1).setFill()
        rect.fill()

        let menuBar = NSBezierPath(
            roundedRect: rect.insetBy(dx: 0, dy: 0),
            xRadius: 0,
            yRadius: 0
        )
        NSColor(calibratedWhite: 0.16, alpha: 1).setFill()
        menuBar.fill()

        let notchRect = CGRect(
            x: rect.midX - notchGapWidth / 2,
            y: 0,
            width: notchGapWidth,
            height: rect.height - 3
        )
        let notch = NSBezierPath(
            roundedRect: notchRect,
            xRadius: 13,
            yRadius: 13
        )
        NSColor.black.setFill()
        notch.fill()

        NSColor.white.withAlphaComponent(0.1).setFill()
        CGRect(x: 0, y: rect.maxY - 1, width: rect.width, height: 1).fill()
    }
}

enum PreviewError: Error {
    case bitmapCreationFailed
    case contextCreationFailed
    case pngCreationFailed
}

enum PreviewHoverTarget: String {
    case left
    case right
    case placeholder
}
