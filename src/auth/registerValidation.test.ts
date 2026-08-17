import { getRegisterValidationError } from "./registerValidation";

describe("register password validation", () => {
  const base = {
    name: "AURA Tester",
    email: "tester@example.com",
    confirmPassword: "password",
  };

  it("shows an error for passwords under 8 characters", () => {
    expect(
      getRegisterValidationError({
        ...base,
        password: "1234567",
        confirmPassword: "1234567",
      }),
    ).toEqual({
      title: "Weak password",
      message: "Password must be at least 8 characters.",
    });
  });

  it("allows passwords of exactly 8 characters", () => {
    expect(
      getRegisterValidationError({
        ...base,
        password: "12345678",
        confirmPassword: "12345678",
      }),
    ).toBeNull();
  });
});
