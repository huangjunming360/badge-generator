import { Controller } from "@hotwired/stimulus"

// 输入框：Enter 发送、Shift+Enter 换行、随内容长高、发送后清空并滚到底。
export default class extends Controller {
  static targets = ["input"]

  connect() {
    this.inputTarget.focus()
    this.scrollToBottom()
    this.observeMessages()
  }

  disconnect() {
    this.observer?.disconnect()
  }

  submitOnEnter(event) {
    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    if (this.inputTarget.value.trim() === "") return
    this.element.requestSubmit()
  }

  autogrow() {
    this.inputTarget.style.height = "auto"
    this.inputTarget.style.height = `${this.inputTarget.scrollHeight}px`
  }

  reset() {
    this.inputTarget.value = ""
    this.inputTarget.style.height = "auto"
    this.inputTarget.focus()
    document.getElementById("empty_state")?.remove()
  }

  // 流式增量到达时保持视口贴底。
  observeMessages() {
    const list = document.getElementById("messages")
    if (!list) return
    this.observer = new MutationObserver(() => this.scrollToBottom())
    this.observer.observe(list, { childList: true, subtree: true, characterData: true })
  }

  scrollToBottom() {
    const list = document.getElementById("messages")
    if (list) list.scrollTop = list.scrollHeight
  }
}
