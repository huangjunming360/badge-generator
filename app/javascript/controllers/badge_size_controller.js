import { Controller } from "@hotwired/stimulus"

// 尺寸输入实时驱动挂牌的 CSS 变量，不等提交。
export default class extends Controller {
  static targets = ["width", "height", "scale", "hint"]
  static values = {
    min: Number, max: Number,
    defaultWidth: Number, defaultHeight: Number, defaultScale: Number,
  }

  connect() {
    this.badge = document.getElementById("badge")
  }

  apply() {
    const width = this.clamped(this.widthTarget)
    const height = this.clamped(this.heightTarget)
    if (!this.badge) return

    // 只有在范围内才改预览，越界时保留上一个有效值，避免版式抽搐。
    if (width !== null) this.badge.style.setProperty("--badge-width", `${width}mm`)
    if (height !== null) this.badge.style.setProperty("--badge-height", `${height}mm`)
    this.badge.style.setProperty("--badge-scale", this.scale())

    this.showHint(width === null || height === null)
  }

  reset() {
    this.widthTarget.value = this.defaultWidthValue
    this.heightTarget.value = this.defaultHeightValue
    if (this.hasScaleTarget) this.scaleTarget.value = this.defaultScaleValue
    this.apply()
  }

  // 缩放倍数不做范围校验：取值只来自 select 的固定档位。
  scale() {
    if (!this.hasScaleTarget) return this.defaultScaleValue
    const value = parseFloat(this.scaleTarget.value)
    return Number.isNaN(value) ? this.defaultScaleValue : value
  }

  // 返回有效数值，越界或非数字返回 null。
  clamped(input) {
    const value = parseInt(input.value, 10)
    if (Number.isNaN(value)) return null
    if (value < this.minValue || value > this.maxValue) return null
    return value
  }

  showHint(invalid) {
    if (!this.hasHintTarget) return
    this.hintTarget.classList.toggle("text-red-500", invalid)
    this.hintTarget.classList.toggle("text-stone-400", !invalid)
  }
}
