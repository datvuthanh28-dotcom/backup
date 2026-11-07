from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE

OUT = "/Users/htmt1810/Documents/GitHub/backup/Maison_Rue_Website_Features_Overview.docx"

INK = "000000"
CHARCOAL = "2B211C"
WARM_BROWN = "5A4032"
GOLD = "9A7B4F"
CREAM = "F7F4EF"
LINE = "D8CEC1"
LIGHT_GOLD = "EFE7DA"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color=LINE, size="6"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    mar = tc_pr.first_child_found_in("w:tcMar")
    if mar is None:
        mar = OxmlElement("w:tcMar")
        tc_pr.append(mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = mar.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def keep_with_next(paragraph):
    paragraph.paragraph_format.keep_with_next = True


def remove_paragraph_bottom_rule(paragraph):
    """Override Word's built-in Title bottom border without abandoning Title style."""
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "nil")
    borders.append(bottom)
    p_pr.append(borders)


def add_run(paragraph, text, bold=False, italic=False, color=CHARCOAL, size=11, font="Aptos"):
    run = paragraph.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:eastAsia"), font)
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    return run


def add_body(doc, text, after=8):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.26
    add_run(p, text, size=11)
    return p


def add_heading(doc, text, level=1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18 if level == 1 else 11)
    p.paragraph_format.space_after = Pt(7)
    keep_with_next(p)
    add_run(p, text, bold=True, size=18 if level == 1 else 13, font="Georgia")
    return p


def add_bullet(doc, label, detail):
    p = doc.add_paragraph(style="Feature Bullet")
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.18
    add_run(p, label + ": ", bold=True, size=10.7)
    add_run(p, detail, size=10.7)
    return p


doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = Inches(0.72)
section.bottom_margin = Inches(0.68)
section.left_margin = Inches(0.76)
section.right_margin = Inches(0.76)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Aptos"
normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Aptos")
normal.font.size = Pt(11)
normal.font.color.rgb = RGBColor.from_string(CHARCOAL)

title = styles["Title"]
title.font.name = "Georgia"
title._element.rPr.rFonts.set(qn("w:eastAsia"), "Georgia")
title.font.size = Pt(30)
title.font.color.rgb = RGBColor.from_string(INK)
title.font.bold = False

bullet_style = styles.add_style("Feature Bullet", WD_STYLE_TYPE.PARAGRAPH)
bullet_style.base_style = styles["Normal"]
bullet_style.paragraph_format.left_indent = Inches(0.22)
bullet_style.paragraph_format.first_line_indent = Inches(-0.16)
bullet_style.paragraph_format.space_after = Pt(4)

# Header and footer
header = section.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
add_run(header, "MAISON RUE  |  WEBSITE FEATURE OVERVIEW", bold=True, color=GOLD, size=8.5)
footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
add_run(footer, "Maison Rue  •  Internal product overview", color=WARM_BROWN, size=8.5)

# Cover / opening
p = doc.add_paragraph(style="Title")
p.alignment = WD_ALIGN_PARAGRAPH.LEFT
p.paragraph_format.space_before = Pt(76)
p.paragraph_format.space_after = Pt(13)
remove_paragraph_bottom_rule(p)
add_run(p, "Website Feature Overview", size=30, font="Georgia", color=INK)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(28)
add_run(p, "Wishlist for guests, Complete the Look, and return and refund workflow", size=14, color=WARM_BROWN)

intro = doc.add_paragraph()
intro.paragraph_format.space_after = Pt(18)
intro.paragraph_format.line_spacing = 1.35
add_run(intro, "This document introduces three customer-facing features that make the Maison Rue shopping experience more personal, more useful, and easier to manage after purchase. It explains what each feature does, what customers see, and the operational controls that keep the experience reliable.", size=12)

table = doc.add_table(rows=1, cols=3)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
table.autofit = False
widths = [2.14, 2.14, 2.14]
for cell, width, heading, body in zip(table.rows[0].cells, widths,
    ["Guest Wishlist", "Complete the Look", "Return and Refund"],
    ["Save pieces without signing in", "Discover complementary pieces", "Submit and track a request with clear decisions"]):
    cell.width = Inches(width)
    set_cell_shading(cell, CREAM)
    set_cell_border(cell)
    set_cell_margins(cell, 170, 150, 170, 150)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    para = cell.paragraphs[0]
    para.paragraph_format.space_after = Pt(5)
    add_run(para, heading, bold=True, size=11.5, color=CHARCOAL, font="Georgia")
    para = cell.add_paragraph()
    para.paragraph_format.space_after = Pt(0)
    add_run(para, body, size=9.5, color=WARM_BROWN)

doc.add_page_break()

# Wishlist section
add_heading(doc, "Wishlist for Guests")
add_body(doc, "Visitors can save products to a personal wishlist before creating or signing in to an account. This lets a customer return to pieces they liked without forcing an account decision at the first visit.")
add_heading(doc, "How it works", 2)
add_bullet(doc, "Save from product cards or product pages", "A heart control adds or removes the product from the wishlist without interrupting browsing.")
add_bullet(doc, "Persistent guest storage", "Wishlist selections remain available in the same browser as long as its local storage and cookies are kept. This preserves the list across future visits without requiring sign-in.")
add_bullet(doc, "Account continuity", "When a customer signs in, the wishlist experience continues in the customer area, where saved pieces can be reviewed and opened again.")
add_bullet(doc, "Clear navigation", "The header provides direct access to Wishlist so saved pieces are always one action away.")

add_heading(doc, "Customer value", 2)
add_body(doc, "The feature supports considered shopping. Customers can compare materials, colours and silhouettes over time, then return when they are ready to buy. It is especially useful for a luxury assortment where the decision is often deliberate rather than immediate.")

add_heading(doc, "Complete the Look")
add_body(doc, "Complete the Look presents complementary products on product detail pages. It is designed to help customers build a coherent outfit rather than merely show more of the same category.")
add_heading(doc, "Recommendation approach", 2)
table = doc.add_table(rows=1, cols=3)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
table.autofit = False
headers = ["Product being viewed", "Suggested categories", "Selection logic"]
for i, text in enumerate(headers):
    cell = table.rows[0].cells[i]
    cell.width = Inches([1.65, 2.08, 2.69][i])
    set_cell_shading(cell, CHARCOAL)
    set_cell_border(cell, CHARCOAL)
    set_cell_margins(cell, 95, 100, 95, 100)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    para = cell.paragraphs[0]
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(para, text, bold=True, size=9.5, color="FFFFFF")
set_repeat_table_header(table.rows[0])
rows = [
    ("Sweater or knitwear", "Trousers, outerwear, shoes", "Avoid another shirt or sweater. Prefer harmonious neutrals, compatible fabric weight and a balanced outfit."),
    ("Shirt or blouse", "Trousers, outerwear, shoes", "Pair with a compatible trouser silhouette, then complete with an appropriate jacket or footwear."),
    ("Trousers or skirt", "Top, outerwear, shoes", "Suggest an upper layer and footwear that suit the shape, occasion and colour palette."),
    ("Outerwear", "Top, trousers, shoes", "Build a complete base layer and keep materials and tones consistent with the coat or jacket."),
    ("Shoes or accessories", "Top, trousers, outerwear", "Use the product’s material and colour family to propose a complete outfit rather than more accessories."),
]
for row_values in rows:
    cells = table.add_row().cells
    for i, text in enumerate(row_values):
        cells[i].width = Inches([1.65, 2.08, 2.69][i])
        set_cell_border(cells[i])
        set_cell_margins(cells[i], 100, 100, 100, 100)
        cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if len(table.rows) % 2 == 1:
            set_cell_shading(cells[i], CREAM)
        p = cells[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        add_run(p, text, size=9.4)

add_heading(doc, "Current and future refinement", 2)
add_body(doc, "The current recommendation logic prioritises category complementarity, material compatibility and colour palette. As order data grows, the catalogue can also rank recommendations using products commonly purchased together, while retaining the category rules so the suggestions remain appropriate and varied.")

# Returns section
add_heading(doc, "Return Refund and Exchange")
add_body(doc, "Customers can start a return, refund or exchange request from an eligible delivered order in their account. The request is attached to the exact product line, colour, size and quantity, giving both the customer and Client Care a clear record of what is being requested.")

add_heading(doc, "Customer request journey", 2)
steps = [
    ("1", "Open an eligible delivered order", "The customer selects Request return refund for the relevant product line."),
    ("2", "Choose a request type and reason", "Refund and exchange requests capture the reason, quantity and, for exchange, the preferred size and colour from the available product variants."),
    ("3", "Receive an immediate policy outcome", "The request may be authorised, declined or routed to Client Care manual review based on the order, reason, timing and value."),
    ("4", "Return and physical inspection", "No photo is required at submission. Maison Rue inspects the received item before a refund is issued or an exchange is dispatched."),
    ("5", "Final customer update", "Approved refunds are communicated with the stated processing period. Approved exchanges are arranged subject to replacement stock."),
]
table = doc.add_table(rows=1, cols=3)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
table.autofit = False
for i, text in enumerate(["Step", "Customer action", "What the system records"]):
    cell = table.rows[0].cells[i]
    cell.width = Inches([0.52, 2.05, 3.85][i])
    set_cell_shading(cell, CHARCOAL)
    set_cell_border(cell, CHARCOAL)
    set_cell_margins(cell, 95, 100, 95, 100)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
    add_run(p, text, bold=True, size=9.5, color="FFFFFF")
set_repeat_table_header(table.rows[0])
for index, action, record in steps:
    cells = table.add_row().cells
    for i, text in enumerate([index, action, record]):
        cells[i].width = Inches([0.52, 2.05, 3.85][i])
        set_cell_border(cells[i])
        set_cell_margins(cells[i], 105, 100, 105, 100)
        cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if len(table.rows) % 2 == 1:
            set_cell_shading(cells[i], CREAM)
        p = cells[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else WD_ALIGN_PARAGRAPH.LEFT
        add_run(p, text, bold=(i == 1), size=9.25)

add_heading(doc, "Decision and review safeguards", 2)
add_bullet(doc, "Automatic decline", "Requests outside the 14 calendar day window, requests for promotional items where no Maison Rue fulfilment error applies, or items reported as worn, washed or altered are declined under the stated policy.")
add_bullet(doc, "Automatic authorisation or manual review", "Documented fulfilment errors such as the wrong item, wrong size or colour sent, missing items, damage on arrival and possible manufacturing defects can be authorised or reviewed. Higher-value requests and multi-item requests are routed to a human review path.")
add_bullet(doc, "One request per product line", "Once a return or exchange request exists for a line item, the customer sees its status instead of another request button. The API also enforces this rule.")
add_bullet(doc, "Review eligibility", "Items with an unresolved, declined or refunded request cannot be reviewed. Items with no request, and items whose exchange has been completed, remain eligible for review.")

add_heading(doc, "Inventory and financial controls", 2)
add_body(doc, "Stock changes happen only after physical inspection passes. A completed refund restores the original SKU quantity to inventory. A completed exchange restores the returned SKU and deducts the replacement SKU in the same database transaction. If any validation fails, including insufficient replacement stock or a payment problem, the entire operation rolls back. Every movement is recorded in the inventory audit log with the request reference and staff member who completed it.")

add_heading(doc, "What customers see", 2)
add_body(doc, "The order history page shows the latest request state beside the product line. When inspection has passed, customers see Request approved and the next step: a refund to the original payment method or an exchange arrangement within three working days, with Client Services contact guidance for further support.")

doc.save(OUT)
print(OUT)
