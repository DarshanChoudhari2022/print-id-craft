type SectionRenameResult =
  | { name: string; error: null }
  | { name: null; error: string }

export function prepareSectionRename(
  currentName: string,
  draftName: string,
): SectionRenameResult {
  const name = draftName.trim()

  if (!name) {
    return { name: null, error: "Section name is required" }
  }

  if (name === currentName.trim()) {
    return { name: null, error: "Enter a different section name" }
  }

  return { name, error: null }
}
