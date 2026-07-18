import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("JPG template mapper last-used text style", () => {
  it("persists the last text styling and applies it to newly added text fields", () => {
    const mapper = readFileSync("src/components/JpgTemplateMapper.tsx", "utf8")

    expect(mapper).toContain("LAST_TEXT_FIELD_STYLE_STORAGE_KEY")
    expect(mapper).toContain("window.localStorage.setItem(LAST_TEXT_FIELD_STYLE_STORAGE_KEY")
    expect(mapper).toContain("parseLastTextFieldStyle(window.localStorage.getItem(LAST_TEXT_FIELD_STYLE_STORAGE_KEY))")
    expect(mapper).toContain("const savedTextStyle = type === \"text\" ? lastTextFieldStyle : null")
    expect(mapper).toContain("fontSize: savedTextStyle?.fontSize ?? 14")
    expect(mapper).toContain("fontFamily: savedTextStyle?.fontFamily ?? \"Arial\"")
    expect(mapper).toContain("fontColor: savedTextStyle?.fontColor ?? \"#000000\"")
  })

  it("does not save live dialog preview changes until the dialog is accepted", () => {
    const mapper = readFileSync("src/components/JpgTemplateMapper.tsx", "utf8")

    expect(mapper).toContain("}, false)")
    expect(mapper).toContain("rememberSelectedTextFieldStyle(); clearDialogSnapshot(); setShowFontDialog(false)")
    expect(mapper).toContain("rememberSelectedTextFieldStyle(); clearDialogSnapshot(); setShowColorDialog(false)")
    expect(mapper).toContain("revertDialogSnapshot(); setShowFontDialog(false)")
    expect(mapper).toContain("revertDialogSnapshot(); setShowColorDialog(false)")
  })
})
