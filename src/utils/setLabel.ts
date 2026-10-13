// 画面に出すパック名。表示名が入っていればそれを、無ければ弾名（フルネーム）を使う
export function setLabel(s: { set_name: string; display_name?: string | null }): string {
    return (s.display_name ?? '').trim() || s.set_name
  }