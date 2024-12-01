import { useMemo } from "react";

// Helper to convert hex to RGB
const hexToRGB = (hex) => {
  // Remove # if present
  hex = hex.replace("#", "");

  // Handle shorthand hex (e.g., #FFF)
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
};

// Helper to convert RGB to hex
const rgbToHex = (r, g, b) => {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
};

// Calculate relative luminance
const getLuminance = (r, g, b) => {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

/**
 * Hook to determine the optimal contrast color (black or white) for text
 * based on a background color.
 *
 * @param {string} backgroundColor - Hex color code (with or without #)
 * @param {object} options - Optional configuration
 * @param {string} options.darkColor - Custom dark color (defaults to #000000)
 * @param {string} options.lightColor - Custom light color (defaults to #FFFFFF)
 * @param {number} options.threshold - Custom luminance threshold (defaults to 0.179)
 * @returns {string} Contrasting color in hex format
 */
export const useContrastColor = (backgroundColor, options = {}) => {
  const {
    darkColor = "#000000",
    lightColor = "#FFFFFF",
    threshold = 0.179,
  } = options;

  return useMemo(() => {
    try {
      // Handle invalid input
      if (!backgroundColor || typeof backgroundColor !== "string") {
        console.warn("useContrastColor: Invalid background color provided");
        return darkColor;
      }

      // Normalize hex color
      const color = backgroundColor.startsWith("#")
        ? backgroundColor
        : `#${backgroundColor}`;

      // Convert hex to RGB
      const { r, g, b } = hexToRGB(color);

      // Calculate luminance
      const luminance = getLuminance(r, g, b);

      // Return appropriate contrast color
      return luminance > threshold ? darkColor : lightColor;
    } catch (error) {
      console.warn("useContrastColor: Error calculating contrast color", error);
      return darkColor;
    }
  }, [backgroundColor, darkColor, lightColor, threshold]);
};
