export interface RevisionSummary { revision: number; createdAt: string; editorName: string }

export function RevisionHistory({ revisions }: { revisions: RevisionSummary[] }) {
  return <section><h3>修订历史</h3><ol aria-label="修订历史">{revisions.map((item) => <li key={item.revision}><strong>版本 {item.revision}</strong> · {item.editorName} · <time dateTime={item.createdAt}>{item.createdAt}</time></li>)}</ol></section>;
}
