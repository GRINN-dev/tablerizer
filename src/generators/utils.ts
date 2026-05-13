export function escapeIdent(name: string): string {
  if (/^[a-z_][a-z0-9_]*$/.test(name)) return name;
  return `"${name}"`;
}

export function sectionHeader(title: string): string[] {
  return [
    `-- ----------------------------------------`,
    `-- ${title}`,
    `-- ----------------------------------------`,
  ];
}

export function escapeComment(text: string): string {
  return text.includes("'") ? `$$${text}$$` : `'${text}'`;
}

export function applyRoleMappings(
  content: string,
  roleMappings: Record<string, string>,
): string {
  let mappedContent = content;

  for (const [actualRole, placeholder] of Object.entries(roleMappings)) {
    // Replace role names in various SQL contexts
    const patterns = [
      // GRANT/REVOKE TO/FROM role
      new RegExp(`\\b(TO|FROM)\\s+"?${actualRole}"?\\b`, "gi"),
      // Role in policy definitions
      new RegExp(`\\b"?${actualRole}"?\\b(?=\\s*[,;)])`, "gi"),
    ];

    for (const pattern of patterns) {
      mappedContent = mappedContent.replace(pattern, (match) => {
        return match.replace(
          new RegExp(`"?${actualRole}"?`, "gi"),
          placeholder,
        );
      });
    }
  }

  return mappedContent;
}
