/** Editor-side formatting policy. All formatting itself is delegated to gungnir lsp. */
export interface FormattingContext {
  trusted: boolean;
  enabled: boolean;
  languageId: string;
  scheme: string;
  inWorkspace: boolean;
}

export function mayFormat(context: FormattingContext): boolean {
  return context.trusted
    && context.enabled
    && context.languageId === 'gungnir'
    && context.scheme === 'file'
    && context.inWorkspace;
}
