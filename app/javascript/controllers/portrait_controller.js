import { Controller } from "@hotwired/stimulus"

// 选中证件照后就地预览，不上传服务器。
export default class extends Controller {
  static targets = ["input", "image", "placeholder", "filename", "frame"]

  preview() {
    const file = this.inputTarget.files[0]
    if (!file) return

    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = URL.createObjectURL(file)

    this.imageTarget.src = this.objectUrl
    this.imageTarget.classList.remove("hidden")
    this.placeholderTarget.classList.add("hidden")
    this.frameTarget.classList.remove("border-dashed")
    this.filenameTarget.textContent = file.name
  }

  disconnect() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
  }
}
