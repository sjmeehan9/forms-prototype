/**
 * Design for the two-page transfer request. Geometry follows the measured reference layout;
 * every word, colour name and asset here is authored for the prototype.
 */
const SANS = "Myriad Pro";
const SERIF = "Georgia";
const LEFT = 42.5;
const WIDTH = 509.6;

export default function design(h) {
  const footer = (pageLabel, slot) => [
    h.data("trustee.name", LEFT, 787.2, 135, 10, "footer", slot),
    h.text(LEFT, 796.7, 20, 10, "ABN", "footer"),
    h.data("trustee.abn", LEFT + 19, 796.7, 110, 10, "footer", slot),
    h.text(LEFT, 806.2, 24, 10, "AFSL", "footer"),
    h.data("trustee.afsl", LEFT + 23, 806.2, 100, 10, "footer", slot),
    h.data("fund.name", 184.3, 787.2, 150, 10, "footer", slot),
    h.text(184.3, 796.7, 20, 10, "ABN", "footer"),
    h.data("fund.abn", 203.3, 796.7, 110, 10, "footer", slot),
    h.text(372, 805.8, 180, 10, pageLabel, "footer-right"),
  ];

  return {
    output: { printPdf: true, interactivePdf: true, saveIndd: true },
    labelPlacement: "above",
    labelStyle: "label",
    optionStyle: "label",
    showHints: true,
    fieldBox: { fill: "Paper", stroke: "field.stroke", strokeWeight: 0.5, radioShape: "oval" },
    componentStyles: { heading: "component-heading", body: "body", "body-strong": "body-strong", "list-item": "bullet", note: "note" },
    swatches: {
      "brand.primary": { cmyk: [30, 40, 50, 30] },
      "brand.accent": { cmyk: [0, 35, 85, 0] },
      "brand.tint": { cmyk: [4, 5, 8, 4] },
      "panel.tint": { cmyk: [6, 8, 11, 6] },
      "field.stroke": { cmyk: [30, 40, 50, 30] },
      "text.body": { cmyk: [0, 0, 0, 90] },
    },
    styles: {
      h1: { fontFamily: SERIF, bold: true, pointSize: 24, leading: 28, color: "brand.primary" },
      h2: { fontFamily: SERIF, bold: true, pointSize: 14.5, leading: 17, color: "brand.primary" },
      lead: { fontFamily: SANS, bold: true, pointSize: 9.5, leading: 12, color: "text.body" },
      subhead: { fontFamily: SANS, bold: true, pointSize: 9.5, leading: 12, color: "text.body" },
      body: { fontFamily: SANS, pointSize: 8.5, leading: 10.6, color: "text.body", spaceAfter: 3 },
      "body-strong": { fontFamily: SANS, bold: true, pointSize: 8.5, leading: 10.6, color: "text.body", spaceAfter: 3 },
      "component-heading": { fontFamily: SANS, bold: true, pointSize: 9.5, leading: 12, color: "brand.primary", spaceAfter: 2 },
      bullet: { fontFamily: SANS, pointSize: 8.5, leading: 10.6, color: "text.body", bullets: true, indent: 9, spaceAfter: 1.5 },
      note: { fontFamily: SANS, pointSize: 7.6, leading: 9.4, color: "text.body" },
      label: { fontFamily: SANS, pointSize: 8.5, leading: 10.6, color: "text.body" },
      value: { fontFamily: SANS, bold: true, pointSize: 9.5, leading: 12, color: "text.body" },
      brandname: { fontFamily: SERIF, bold: true, pointSize: 13, leading: 15, color: "brand.primary", align: "right" },
      footer: { fontFamily: SERIF, pointSize: 7.5, leading: 9.4, color: "text.body" },
      "footer-right": { fontFamily: SERIF, pointSize: 7.5, leading: 9.4, color: "text.body", align: "right" },
    },
    groupLabels: {
      "transfer.amountType": { text: "How much should we transfer? *", left: LEFT, top: 279.4, width: 260 },
    },
    labelOverrides: {
      "member.gender:other": { left: 170, top: 337.5, width: 70 },
      "transfer.partialAmount": { hidden: true },
      "declaration.signature": { left: LEFT, top: 620.2, width: 100 },
      "declaration.date": { text: "Date signed *", left: 200.7, top: 640.3, width: 84 },
    },
    pages: {
      1: [
        h.rect(0, 0, 595.3, 121.3, { fill: "brand.tint" }),
        h.asset("brand.logo", 497, 12, 56, 38),
        h.data("fund.name", 300, 24, 190, 16, "brandname", "header"),
        h.text(LEFT, 79.4, 400, 30, "Combine your super", "h1"),
        h.text(LEFT, 136.8, 420, 13, "Ask us to bring your other super into your account", "lead"),
        h.text(LEFT, 152.1, 132, 11, "You can also do this online at", "body"),
        h.data("contact.website", 172, 152.1, 260, 11, "body-strong", "intro"),
        h.text(LEFT, 164.7, 200, 11, "* Fields marked with a star must be completed.", "body-strong"),
        h.rule(LEFT, 188.2, WIDTH, { stroke: "brand.primary", strokeWeight: 3 }),
        h.text(LEFT, 194.3, 400, 18, "1. Your account with us", "h2"),
        h.text(308.5, 249.2, 100, 11, "Fund ABN", "label"),
        h.data("fund.abn", 308.9, 262.5, 186, 14, "value", "section1"),
        h.text(LEFT, 287, 250, 11, "Unique superannuation identifier (USI)", "label"),
        h.data("fund.usi", LEFT, 300.5, 243, 14, "value", "section1"),
        h.rect(LEFT, 505.2, WIDTH, 43.8, { fill: "panel.tint" }),
        h.content("tfn.notice", 51, 510.5, 492, 34, "note"),
        h.rule(LEFT, 562.2, WIDTH, { stroke: "brand.primary", strokeWeight: 3 }),
        h.text(LEFT, 568.8, 400, 18, "2. Where you live", "h2"),
        h.text(LEFT, 588.3, 300, 12, "Current home address (not a PO box)", "subhead"),
        h.content("privacy.statement", LEFT, 694, WIDTH, 84, "body"),
        ...footer("Combine your super | 1 of 2", "footer1"),
      ],
      2: [
        h.rule(LEFT, 33.2, WIDTH, { stroke: "brand.primary", strokeWeight: 3 }),
        h.text(LEFT, 39.2, 400, 18, "2. Where you live (continued)", "h2"),
        h.text(LEFT, 59.8, 300, 12, "Previous home address (if you know it)", "subhead"),
        h.rule(LEFT, 146.5, WIDTH, { stroke: "brand.primary", strokeWeight: 3 }),
        h.text(LEFT, 152.6, 400, 18, "3. The fund you are transferring from", "h2"),
        h.text(LEFT, 169.5, 480, 12, "Tell us about the super account you want moved into this fund.", "subhead"),
        h.text(142, 312.6, 9, 11, "$", "label"),
        h.text(LEFT, 331.8, 300, 9, "Fields for self-managed funds are needed only when transferring from one.", "note"),
        h.rule(LEFT, 345, WIDTH, { stroke: "brand.primary", strokeWeight: 3 }),
        h.text(LEFT, 351.4, 400, 18, "4. Your authorisation", "h2"),
        h.content("declaration.transfer", LEFT, 370, WIDTH, 210, "body"),
                h.rule(LEFT, 677, WIDTH, { stroke: "brand.primary", strokeWeight: 3 }),
        h.text(LEFT, 686.5, 400, 18, "5. Send us your form", "h2"),
        h.content("return.instructions", LEFT, 704.5, 300, 40, "body"),
        h.data("contact.postal.address", LEFT, 748, 300, 11, "body-strong", "return"),
        h.data("contact.email", LEFT, 760, 300, 11, "body-strong", "return"),
        h.text(330, 704.5, 60, 11, "Questions?", "body-strong"),
        h.data("contact.phone", 330, 716.5, 120, 11, "body-strong", "return"),
        h.data("contact.hours", 330, 728.5, 222, 11, "body", "return"),
        h.data("form.consolidate.code", LEFT, 775, 200, 9, "note", "footer"),
        ...footer("Combine your super | 2 of 2", "footer2"),
      ],
    },
  };
}
