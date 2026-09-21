// Lists document metadata and every AcroForm widget of a PDF as JSON, using macOS PDFKit (no installs).
// Coordinates are converted to a top-left origin in points so they match InDesign geometry and poppler bbox output.
import Foundation
import PDFKit

func widgetTypeName(_ annotation: PDFAnnotation) -> String {
    let fieldType = annotation.widgetFieldType
    switch fieldType {
    case .text: return "text"
    case .button:
        switch annotation.widgetControlType {
        case .checkBoxControl: return "checkbox"
        case .radioButtonControl: return "radio"
        case .pushButtonControl: return "button"
        default: return "button"
        }
    case .choice: return annotation.isListChoice ? "list" : "combo"
    case .signature: return "signature"
    default: return "unknown"
    }
}

func round1(_ value: CGFloat) -> Double {
    return (Double(value) * 10).rounded() / 10
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: pdf-fields <pdf>\n".data(using: .utf8)!)
    exit(2)
}
guard let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("cannot open \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

var metadata: [String: Any] = [
    "pages": doc.pageCount,
    "encrypted": doc.isEncrypted,
    "allowsCopying": doc.allowsCopying,
]
if let attrs = doc.documentAttributes {
    for key in ["Title", "Author", "Subject", "Creator", "Producer"] {
        if let value = attrs[key] as? String { metadata[key.lowercased()] = value }
    }
}

var pages: [[String: Any]] = []
for index in 0..<doc.pageCount {
    guard let page = doc.page(at: index) else { continue }
    let media = page.bounds(for: .mediaBox)
    var fields: [[String: Any]] = []
    var links: [[String: Any]] = []
    for annotation in page.annotations {
        let b = annotation.bounds
        let box: [String: Any] = [
            "left": round1(b.minX - media.minX),
            "top": round1(media.maxY - b.maxY),
            "width": round1(b.width),
            "height": round1(b.height),
        ]
        if annotation.type == "Widget" {
            var field: [String: Any] = box
            field["name"] = annotation.fieldName ?? ""
            field["type"] = widgetTypeName(annotation)
            field["tooltip"] = annotation.userName ?? ""
            field["maxLength"] = annotation.maximumLength
            field["multiline"] = annotation.isMultiline
            field["readOnly"] = annotation.isReadOnly
            field["comb"] = annotation.hasComb
            field["onState"] = annotation.buttonWidgetStateString
            field["value"] = annotation.widgetStringValue ?? ""
            if let choices = annotation.choices { field["choices"] = choices }
            fields.append(field)
        } else if annotation.type == "Link" {
            var link: [String: Any] = box
            link["url"] = annotation.url?.absoluteString ?? ""
            links.append(link)
        }
    }
    pages.append([
        "number": index + 1,
        "width": round1(media.width),
        "height": round1(media.height),
        "rotation": page.rotation,
        "fields": fields,
        "links": links,
    ])
}

let output: [String: Any] = ["metadata": metadata, "pages": pages]
let data = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
