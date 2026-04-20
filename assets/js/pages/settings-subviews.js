"use strict";

import { toArray } from "../utils/helpers.js";

const SETTINGS_EDIT_PROFILE_ID = "settings-edit-profile";
const SETTINGS_CHANGE_PASSWORD_ID = "settings-change-password";

export const initSettingsSubviews = () => {
	const settingsMain = document.getElementById("settings-main");
	if (!settingsMain) {
		return;
	}

	const settingsEditProfile = document.getElementById(SETTINGS_EDIT_PROFILE_ID);
	const settingsChangePassword = document.getElementById(SETTINGS_CHANGE_PASSWORD_ID);
	const settingsActionItems = toArray(document.querySelectorAll("#settings-main .settings-item[data-action]"));
	const settingsBackButtons = toArray(
		document.querySelectorAll(".settings-back-btn[data-action='back-to-main']")
	);

	const showSettingsMain = () => {
		settingsMain.classList.remove("is-hidden");
		settingsEditProfile?.classList.add("is-hidden");
		settingsChangePassword?.classList.add("is-hidden");
	};

	const openSettingsSubview = (subviewId) => {
		showSettingsMain();

		if (subviewId === SETTINGS_EDIT_PROFILE_ID) {
			settingsMain.classList.add("is-hidden");
			settingsEditProfile?.classList.remove("is-hidden");
		}

		if (subviewId === SETTINGS_CHANGE_PASSWORD_ID) {
			settingsMain.classList.add("is-hidden");
			settingsChangePassword?.classList.remove("is-hidden");
		}
	};

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
};
