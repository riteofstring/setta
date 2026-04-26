import type { SettaPluginHost } from "@setta/app-subsystem-frontend-sdk";
import { apiVersion, register } from "../src/index";

const host = {
  apiVersion,
} satisfies Partial<SettaPluginHost>;

register(host);
