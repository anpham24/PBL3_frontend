"use strict";

document.addEventListener("DOMContentLoaded", () => {
	const navButtons = Array.from(document.querySelectorAll(".side-nav .nav-item"));
	const viewSections = Array.from(document.querySelectorAll(".view-section"));

	const modal = document.getElementById("create-post-modal");
	const step1Upload = document.getElementById("step-1-upload");
	const step2Details = document.getElementById("step-2-details");
	const chooseFileBtn = document.getElementById("choose-file-btn");
	const postFileInput = document.getElementById("post-file-input");
	const closeCreateModalBtn = document.getElementById("close-create-modal");
	const publishPostBtn = document.getElementById("publish-post-btn");
	const postCaptionInput = document.getElementById("post-caption-input");
	const postDraftPreview = document.getElementById("post-draft-preview");

	const FEED_VIEW_ID = "feed-view";
	const CREATE_VIEW_ID = "create-view";
	const SETTINGS_VIEW_ID = "settings-view";
	const SETTINGS_EDIT_PROFILE_ID = "settings-edit-profile";
	const SETTINGS_CHANGE_PASSWORD_ID = "settings-change-password";

	const settingsMain = document.getElementById("settings-main");
	const settingsEditProfile = document.getElementById(SETTINGS_EDIT_PROFILE_ID);
	const settingsChangePassword = document.getElementById(SETTINGS_CHANGE_PASSWORD_ID);
	const settingsActionItems = Array.from(document.querySelectorAll("#settings-main .settings-item[data-action]"));
	const settingsBackButtons = Array.from(document.querySelectorAll("#settings-view .settings-back-btn[data-action='back-to-main']"));
	const postMenuWraps = Array.from(document.querySelectorAll(".post-menu-wrap"));
	const postMenuButtons = Array.from(document.querySelectorAll(".post-menu-btn"));
	const postDropdownMenus = Array.from(document.querySelectorAll(".post-dropdown-menu"));
	const postDropdownItems = Array.from(document.querySelectorAll(".post-dropdown-item"));
	const commentModal = document.getElementById("comment-modal");
	const closeCommentModalBtn = document.getElementById("close-comment-modal");
	const feedCommentTriggers = Array.from(document.querySelectorAll(".comment-open-btn"));
	const profileGridTriggers = Array.from(document.querySelectorAll(".profile-grid .grid-item"));
	const likeCommentModalBtn = document.getElementById("btn-like-comment-modal");
	const saveCommentModalBtn = document.getElementById("btn-save-comment-modal");

	const resetModalState = () => {
		if (postFileInput) {
			postFileInput.value = "";
		}

		if (postCaptionInput) {
			postCaptionInput.value = "";
		}

		if (postDraftPreview) {
			postDraftPreview.removeAttribute("src");
			postDraftPreview.alt = "Ảnh bản nháp bài đăng";
		}

		if (step1Upload) {
			step1Upload.classList.remove("is-hidden");
		}

		if (step2Details) {
			step2Details.classList.add("is-hidden");
		}
	};

	const openCreateModal = () => {
		if (!modal) {
			return;
		}

		resetModalState();
		modal.classList.add("open");
		modal.setAttribute("aria-hidden", "false");
	};

	const closeCreateModal = () => {
		if (!modal) {
			return;
		}

		modal.classList.remove("open");
		modal.setAttribute("aria-hidden", "true");
		resetModalState();
	};

	const showView = (targetId) => {
		viewSections.forEach((section) => {
			section.classList.toggle("active", section.id === targetId);
		});
	};

	const setActiveMenu = (activeButton) => {
		navButtons.forEach((button) => {
			button.classList.toggle("active", button === activeButton);
		});
	};

	const showSettingsMain = () => {
		settingsMain?.classList.remove("is-hidden");
		settingsEditProfile?.classList.add("is-hidden");
		settingsChangePassword?.classList.add("is-hidden");
	};

	const openSettingsSubview = (subviewId) => {
		showSettingsMain();

		if (subviewId === SETTINGS_EDIT_PROFILE_ID) {
			settingsMain?.classList.add("is-hidden");
			settingsEditProfile?.classList.remove("is-hidden");
		}

		if (subviewId === SETTINGS_CHANGE_PASSWORD_ID) {
			settingsMain?.classList.add("is-hidden");
			settingsChangePassword?.classList.remove("is-hidden");
		}
	};

	const closeAllPostMenus = (exceptWrap = null) => {
		postMenuWraps.forEach((wrap) => {
			if (wrap !== exceptWrap) {
				wrap.classList.remove("open");
			}
		});
	};

	const openCommentModal = () => {
		if (!commentModal) {
			return;
		}

		commentModal.classList.add("open");
		commentModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

	const closeCommentModal = () => {
		if (!commentModal) {
			return;
		}

		commentModal.classList.remove("open");
		commentModal.setAttribute("aria-hidden", "true");
		document.body.style.overflow = "";
	};

	const toggleCommentActionIcon = (button, outlinedClass, solidClass) => {
		if (!button) {
			return;
		}

		const icon = button.querySelector("i");
		if (!icon) {
			return;
		}

		const isActive = button.classList.toggle("active");
		icon.classList.toggle(outlinedClass, !isActive);
		icon.classList.toggle(solidClass, isActive);
	};

	navButtons.forEach((button) => {
		button.addEventListener("click", () => {
			const targetId = button.dataset.target;

			if (!targetId) {
				return;
			}

			if (targetId === CREATE_VIEW_ID) {
				openCreateModal();
				return;
			}

			showView(targetId);
			setActiveMenu(button);

			if (targetId === SETTINGS_VIEW_ID) {
				showSettingsMain();
			}
		});
	});

	settingsActionItems.forEach((item) => {
		item.addEventListener("click", () => {
			const action = item.dataset.action;

			if (action === "edit-profile") {
				openSettingsSubview(SETTINGS_EDIT_PROFILE_ID);
			}

			if (action === "change-password") {
				openSettingsSubview(SETTINGS_CHANGE_PASSWORD_ID);
			}
		});
	});

	settingsBackButtons.forEach((button) => {
		button.addEventListener("click", showSettingsMain);
	});

	postMenuButtons.forEach((button) => {
		button.addEventListener("click", (event) => {
			event.stopPropagation();

			const currentWrap = button.closest(".post-menu-wrap");
			if (!currentWrap) {
				return;
			}

			const shouldOpen = !currentWrap.classList.contains("open");
			closeAllPostMenus();

			if (shouldOpen) {
				currentWrap.classList.add("open");
			}
		});
	});

	postDropdownMenus.forEach((menu) => {
		menu.addEventListener("click", (event) => {
			event.stopPropagation();
		});
	});

	postDropdownItems.forEach((item) => {
		item.addEventListener("click", () => {
			closeAllPostMenus();
		});
	});

	document.addEventListener("click", () => {
		closeAllPostMenus();
	});

	feedCommentTriggers.forEach((trigger) => {
		trigger.addEventListener("click", () => {
			openCommentModal();
		});
	});

	profileGridTriggers.forEach((trigger) => {
		trigger.addEventListener("click", (event) => {
			event.preventDefault();
			openCommentModal();
		});
	});

	closeCommentModalBtn?.addEventListener("click", closeCommentModal);

	commentModal?.addEventListener("click", (event) => {
		if (event.target === commentModal) {
			closeCommentModal();
		}
	});

	likeCommentModalBtn?.addEventListener("click", () => {
		toggleCommentActionIcon(likeCommentModalBtn, "bx-heart", "bxs-heart");
	});

	saveCommentModalBtn?.addEventListener("click", () => {
		toggleCommentActionIcon(saveCommentModalBtn, "bx-bookmark", "bxs-bookmark");
	});

	chooseFileBtn?.addEventListener("click", () => {
		postFileInput?.click();
	});

	postFileInput?.addEventListener("change", (event) => {
		const selectedFile = event.target.files?.[0];

		if (!selectedFile) {
			return;
		}

		const reader = new FileReader();
		reader.onload = (loadEvent) => {
			const dataUrl = loadEvent.target?.result;

			if (typeof dataUrl !== "string" || !postDraftPreview) {
				return;
			}

			postDraftPreview.src = dataUrl;
			postDraftPreview.alt = selectedFile.name || "Ảnh bản nháp bài đăng";

			step1Upload?.classList.add("is-hidden");
			step2Details?.classList.remove("is-hidden");
		};

		reader.readAsDataURL(selectedFile);
	});

	closeCreateModalBtn?.addEventListener("click", closeCreateModal);
	publishPostBtn?.addEventListener("click", closeCreateModal);

	modal?.addEventListener("click", (event) => {
		if (event.target === modal) {
			closeCreateModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeAllPostMenus();
			closeCommentModal();
		}

		if (event.key === "Escape" && modal?.classList.contains("open")) {
			closeCreateModal();
		}
	});

	const activeView = document.querySelector(".view-section.active");
	if (!activeView) {
		showView(FEED_VIEW_ID);
	}
});
