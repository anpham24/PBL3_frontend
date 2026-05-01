"use strict";

import { toArray } from "../utils/helpers.js";

export const initPostMenus = () => {
	const postMenuWraps = toArray(document.querySelectorAll(".post-menu-wrap"));
	if (postMenuWraps.length === 0) {
		return;
	}

	const postMenuButtons = toArray(document.querySelectorAll(".post-menu-btn"));
	const postDropdownMenus = toArray(document.querySelectorAll(".post-dropdown-menu"));
	const postDropdownItems = toArray(document.querySelectorAll(".post-dropdown-item"));

	const closeAllPostMenus = (exceptWrap = null) => {
		postMenuWraps.forEach((wrap) => {
			if (wrap !== exceptWrap) {
				wrap.classList.remove("open");
			}
		});
	};

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

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeAllPostMenus();
		}
	});
};
