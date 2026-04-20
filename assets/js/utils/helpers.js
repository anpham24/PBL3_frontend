"use strict";

export const toArray = (iterable) => Array.from(iterable || []);

export const toSafeString = (value, fallback = "") => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		return trimmedValue.length > 0 ? trimmedValue : fallback;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	return fallback;
};

export const toSafeId = (value, fallback) => toSafeString(value, fallback);

export const toBoolean = (value) => Boolean(value);
