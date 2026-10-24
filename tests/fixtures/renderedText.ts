type ReactTestRendererJSON = { props: Record<string, unknown>; children: (ReactTestRendererJSON | string)[] | null };

/** All text a rendered tree shows or announces: string children, labels and hints. */
export function renderedText(tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string {
  const out: string[] = [];
  const walk = (node: ReactTestRendererJSON | string) => {
    if (typeof node === 'string') { out.push(node); return; }
    const { accessibilityLabel, accessibilityHint } = node.props;
    if (typeof accessibilityLabel === 'string') out.push(accessibilityLabel);
    if (typeof accessibilityHint === 'string') out.push(accessibilityHint);
    (node.children ?? []).forEach(walk);
  };
  (Array.isArray(tree) ? tree : tree == null ? [] : [tree]).forEach(walk);
  return out.join('\n');
}
