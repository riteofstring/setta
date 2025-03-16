import { describe, expect, it } from "vitest";
import { getModels } from "../models";

describe("getModels API", () => {
  it("should return a list of models", async () => {
    // Mock request and response
    const req = {};
    const res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    // Call the API
    await getModels(req, res);

    // Check if res.json was called with an array of models
    expect(res.json).toHaveBeenCalled();

    // Get the models from the call
    const calledWith = res.json.mock.calls[0][0];
    expect(Array.isArray(calledWith)).toBe(true);
    expect(calledWith.length).toBeGreaterThan(0);

    // Verify model structure
    const model = calledWith[0];
    expect(model).toHaveProperty("id");
    expect(model).toHaveProperty("name");
    expect(model).toHaveProperty("serviceId");
  });
});
