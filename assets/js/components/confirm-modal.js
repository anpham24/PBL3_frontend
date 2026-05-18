/**
 * @file confirm-modal.js
 * @module components/confirm-modal
 *
 * Component modal xác nhận dùng lại được (Reusable Confirm Modal).
 *
 * ── Cách dùng ──────────────────────────────────────────────────────────────────
 *   import { ConfirmModal } from './confirm-modal.js';
 *
 *   const confirmed = await ConfirmModal.show('Xóa bài viết', 'Bạn có chắc không?');
 *   if (confirmed) { // gọi API xóa... }
 *
 * ── Giao thức ──────────────────────────────────────────────────────────────────
 *  - ConfirmModal.show(title, message, options?) → Promise<boolean>
 *    • resolve(true)  khi người dùng bấm nút Xác nhận
 *    • resolve(false) khi người dùng bấm Hủy hoặc click ra ngoài overlay
 *  - Tự inject HTML vào <body> lần đầu tiên được gọi (lazy init).
 *  - Idempotent: gọi lại nhiều lần, chỉ có MỘT modal element tồn tại.
 *  - Nếu người dùng gọi .show() khi modal đang mở, resolve(false) lần gọi cũ
 *    và mở lại với data mới (tránh bị kẹt Promise).
 */

"use strict";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODAL_ID      = "confirm-modal";
const OVERLAY_CLASS = "confirm-modal-overlay";

// ─── HTML Template ────────────────────────────────────────────────────────────

const _buildHTML = () => /* html */`
<div
  id="${MODAL_ID}"
  class="${OVERLAY_CLASS}"
  role="dialog"
  aria-modal="true"
  aria-labelledby="confirm-modal-title"
  aria-describedby="confirm-modal-message"
>
  <div class="confirm-modal-dialog" id="confirm-modal-dialog">
    <!-- Icon vùng trên -->
    <div class="confirm-modal-icon-wrap" aria-hidden="true">
      <div class="confirm-modal-icon">
        <i class="bx bx-trash"></i>
      </div>
    </div>

    <!-- Nội dung -->
    <div class="confirm-modal-body">
      <h2 class="confirm-modal-title" id="confirm-modal-title"></h2>
      <p  class="confirm-modal-message" id="confirm-modal-message"></p>
    </div>

    <!-- Actions -->
    <div class="confirm-modal-actions">
      <button
        type="button"
        class="confirm-modal-btn confirm-modal-btn--cancel"
        id="confirm-modal-cancel"
      >
        <i class="bx bx-x"></i>
        <span>Hủy</span>
      </button>
      <button
        type="button"
        class="confirm-modal-btn confirm-modal-btn--confirm"
        id="confirm-modal-confirm"
      >
        <i class="bx bx-check"></i>
        <span>Xác nhận</span>
      </button>
    </div>
  </div>
</div>
`;

// ─── Internal state ───────────────────────────────────────────────────────────

let _overlayEl   = null;
let _titleEl     = null;
let _messageEl   = null;
let _cancelBtn   = null;
let _confirmBtn  = null;
let _resolveFunc = null;   // Promise resolver của lần gọi hiện tại

// ─── Lifecycle helpers ────────────────────────────────────────────────────────

/**
 * Inject HTML vào body lần đầu tiên, lưu references các phần tử quan trọng.
 * Lần sau gọi → no-op.
 */
const _ensureInjected = () => {
	if (_overlayEl) return;

	const wrapper = document.createElement("div");
	wrapper.innerHTML = _buildHTML().trim();
	const el = wrapper.firstElementChild;
	document.body.appendChild(el);

	_overlayEl  = el;
	_titleEl    = document.getElementById("confirm-modal-title");
	_messageEl  = document.getElementById("confirm-modal-message");
	_cancelBtn  = document.getElementById("confirm-modal-cancel");
	_confirmBtn = document.getElementById("confirm-modal-confirm");

	// ── Gắn event listeners (một lần duy nhất) ──────────────────────────
	_cancelBtn.addEventListener("click", () => _resolve(false));
	_confirmBtn.addEventListener("click", () => _resolve(true));

	// Click ra ngoài overlay (backdrop) → hủy
	_overlayEl.addEventListener("click", (e) => {
		if (e.target === _overlayEl) _resolve(false);
	});

	// Phím Escape → hủy
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && _overlayEl?.classList.contains("open")) {
			_resolve(false);
		}
	});
};

/**
 * Mở modal với nội dung mới.
 */
const _open = (title, message, confirmLabel = "Xác nhận", isDanger = true) => {
	_ensureInjected();

	_titleEl.textContent   = title;
	_messageEl.textContent = message;

	// Cập nhật label nút confirm (tuỳ context)
	const labelSpan = _confirmBtn.querySelector("span");
	if (labelSpan) labelSpan.textContent = confirmLabel;

	// Thêm / bỏ class danger để tuỳ biến màu nút
	_confirmBtn.classList.toggle("confirm-modal-btn--danger", isDanger);

	_overlayEl.classList.add("open");
	_overlayEl.removeAttribute("hidden");

	// Focus vào nút Hủy để an toàn hơn (tránh vô tình Enter → xóa)
	_cancelBtn.focus();
};

/**
 * Đóng modal và resolve Promise đang chờ.
 * @param {boolean} result
 */
const _resolve = (result) => {
	if (!_overlayEl) return;
	_overlayEl.classList.remove("open");
	_overlayEl.setAttribute("hidden", "");

	const fn = _resolveFunc;
	_resolveFunc = null;
	if (typeof fn === "function") fn(result);
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const ConfirmModal = {
	/**
	 * Hiển thị hộp thoại xác nhận.
	 *
	 * @param {string} title          - Tiêu đề hộp thoại.
	 * @param {string} message        - Nội dung thông báo.
	 * @param {object} [options]
	 * @param {string} [options.confirmLabel="Xác nhận"] - Text nút confirm.
	 * @param {boolean} [options.danger=true]            - Nếu true, nút confirm màu đỏ.
	 * @returns {Promise<boolean>}    - true nếu xác nhận, false nếu hủy.
	 */
	show(title, message, options = {}) {
		const { confirmLabel = "Xác nhận", danger = true } = options;

		// Nếu đang có Promise chờ → resolve(false) để tránh memory leak
		if (typeof _resolveFunc === "function") {
			_resolveFunc(false);
			_resolveFunc = null;
		}

		return new Promise((resolve) => {
			_resolveFunc = resolve;
			_open(title, message, confirmLabel, danger);
		});
	},
};
