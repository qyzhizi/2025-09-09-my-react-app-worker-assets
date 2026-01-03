import { sign, verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";
import { getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";

export const verifyOrRefreshAccessToken = async (
	c: Context
): Promise<JWTPayload | null> => {
	let accessToken = getCookie(c, "access_token");

	if (accessToken) {
		try {
			return await verify(accessToken, c.env.ACCESS_TOKEN_SECRET);
		} catch {}
	}

	const refreshToken = getCookie(c, "refresh_token");
	if (!refreshToken) return null;

	let refreshPayload: JWTPayload;
	try {
		refreshPayload = await verify(
			refreshToken,
			c.env.REFRESH_TOKEN_SECRET
		);
	} catch {
		return null;
	}

	const newAccessPayload: JWTPayload = {
		...refreshPayload,
		exp:
			Math.floor(Date.now() / 1000) +
			parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10),
	};

	const newAccessToken = await sign(
		newAccessPayload,
		c.env.ACCESS_TOKEN_SECRET
	);

	setCookie(c, "access_token", newAccessToken, {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		maxAge: parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10),
	});

	return newAccessPayload;
};
