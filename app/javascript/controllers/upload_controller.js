import { Controller } from "@hotwired/stimulus"

// 选中文件后显示文件名，并把文本框置灰提示它会被忽略。
export default class extends Controller {
  static targets = ["input", "filename", "textarea"]

  show() {
    const file = this.inputTarget.files[0]
    if (!file) return

    this.filenameTarget.textContent = file.name
    this.filenameTarget.classList.remove("text-stone-400")
    this.filenameTarget.classList.add("text-stone-700")
    this.textareaTarget.classList.add("opacity-50")
  }
}
