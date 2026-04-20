"use strict";

import { initCreatePostModal } from "./create-post-modal.js";
import { initSettingsSubviews } from "./settings-subviews.js";

const initSettingsPage = () => {
	initCreatePostModal();
	initSettingsSubviews();
};

document.addEventListener("DOMContentLoaded", initSettingsPage);
