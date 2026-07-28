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

    fetch("/setting", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector("meta[name='csrf-token']").content
      },
      body: JSON.stringify({ model_index: parseInt(index) })
    }).then(() => {
      if (this.hasCurrentLabelTarget) {
        this.currentLabelTarget.textContent = label
      }
      this.panelTarget.style.display = "none"
    })
  }

  close(event) {
    if (!this.element.contains(event.target)) {
      this.panelTarget.style.display = "none"
    }
  }
}
