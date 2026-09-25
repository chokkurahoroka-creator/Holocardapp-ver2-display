// 画面幅より確実に長くなる数だけ項目を並べ、CSS側で-50%移動させることで
// 継ぎ目なくループするマーキー表示にする（16項目×2＝32）
const ITEMS = Array.from({ length: 32 })

type Props = {
  position: 'top' | 'bottom'
}

export function MaintenanceBanner({ position }: Props) {
  return (
    <div className={`maintenanceBanner ${position}`}>
      <div className="maintenanceBannerTrack">
        {ITEMS.map((_, i) => (
          <span key={i} className="maintenanceBannerItem">
            ▶ <span className="jp">作業中</span> <span className="en">CAUTION</span> ▶ <span className="en">WORK IN PROGRESS</span>
          </span>
        ))}
      </div>
    </div>
  )
}