import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["panel", "currentLabel"]

  toggle() {
    const panel = this.panelTarget
    panel.style.display = panel.style.display === "none" ? "block" : "none"
  }

  select(event) {
    const index = event.currentTarget.dataset.modelIndex
    const label = event.currentTarget.dataset.modelLabel

    // 立即关闭面板，不等服务器
    this.panelTarget.style.display = "none"
    if (this.hasCurrentLabelTarget) {
      this.currentLabelTarget.textContent = label
    }

    fetch("/setting", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content
      },
      body: JSON.stringify({ model_index: parseInt(index) })
    })
  }

  close(event) {
    if (!this.element.contains(event.target)) {
      this.panelTarget.style.display = "none"
    }
  }
}
