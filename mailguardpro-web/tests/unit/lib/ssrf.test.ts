import { validateResolvedIp } from "@/lib/ssrf";
import { describe, expect, it } from "vitest";

describe("validateResolvedIp", () => {
  describe("public IPs (allowed)", () => {
    it("should allow public IPv4", () => {
      expect(validateResolvedIp("93.184.216.34").valid).toBe(true);
    });

    it("should allow public IPv6", () => {
      expect(validateResolvedIp("2001:db8::1").valid).toBe(true);
    });
  });

  describe("private IPv4 ranges (blocked)", () => {
    it("should block 127.0.0.1 (loopback)", () => {
      expect(validateResolvedIp("127.0.0.1").valid).toBe(false);
    });

    it("should block 10.0.0.1 (class A private)", () => {
      expect(validateResolvedIp("10.0.0.1").valid).toBe(false);
    });

    it("should block 172.16.0.1 (class B private)", () => {
      expect(validateResolvedIp("172.16.0.1").valid).toBe(false);
    });

    it("should block 172.31.255.255 (class B private upper)", () => {
      expect(validateResolvedIp("172.31.255.255").valid).toBe(false);
    });

    it("should allow 172.32.0.1 (not private)", () => {
      expect(validateResolvedIp("172.32.0.1").valid).toBe(true);
    });

    it("should block 192.168.1.1 (class C private)", () => {
      expect(validateResolvedIp("192.168.1.1").valid).toBe(false);
    });

    it("should block 169.254.1.1 (link-local)", () => {
      expect(validateResolvedIp("169.254.1.1").valid).toBe(false);
    });

    it("should block 0.0.0.0 (current network)", () => {
      expect(validateResolvedIp("0.0.0.0").valid).toBe(false);
    });
  });

  describe("IPv6 ranges (blocked)", () => {
    it("should block ::1 (loopback)", () => {
      expect(validateResolvedIp("::1").valid).toBe(false);
    });

    it("should block fc00::1 (ULA)", () => {
      expect(validateResolvedIp("fc00::1").valid).toBe(false);
    });

    it("should block fd00::1 (ULA)", () => {
      expect(validateResolvedIp("fd00::1").valid).toBe(false);
    });

    it("should block fd12:3456:789a::1 (ULA broader)", () => {
      expect(validateResolvedIp("fd12:3456:789a::1").valid).toBe(false);
    });

    it("should block fe80::1 (link-local)", () => {
      expect(validateResolvedIp("fe80::1").valid).toBe(false);
    });

    it("should block ff00::1 (multicast)", () => {
      expect(validateResolvedIp("ff00::1").valid).toBe(false);
    });
  });

  describe("case normalization", () => {
    it("should block uppercase FD00::1", () => {
      expect(validateResolvedIp("FD00::1").valid).toBe(false);
    });

    it("should block uppercase FC00::1", () => {
      expect(validateResolvedIp("FC00::1").valid).toBe(false);
    });

    it("should block uppercase FE80::1", () => {
      expect(validateResolvedIp("FE80::1").valid).toBe(false);
    });
  });
});

describe("IPv4-mapped IPv6 addresses", () => {
  it("should block ::ffff:127.0.0.1 (loopback)", () => {
    expect(validateResolvedIp("::ffff:127.0.0.1").valid).toBe(false);
  });

  it("should block ::ffff:10.0.0.1 (private)", () => {
    expect(validateResolvedIp("::ffff:10.0.0.1").valid).toBe(false);
  });

  it("should block ::ffff:192.168.1.1 (private)", () => {
    expect(validateResolvedIp("::ffff:192.168.1.1").valid).toBe(false);
  });

  it("should block ::ffff:172.16.0.1 (private)", () => {
    expect(validateResolvedIp("::ffff:172.16.0.1").valid).toBe(false);
  });

  it("should allow ::ffff:93.184.216.34 (public)", () => {
    expect(validateResolvedIp("::ffff:93.184.216.34").valid).toBe(true);
  });
});

describe("IPv6 unspecified address", () => {
  it("should block :: (unspecified)", () => {
    expect(validateResolvedIp("::").valid).toBe(false);
  });
});

describe("input validation", () => {
  it("should reject empty string", () => {
    expect(validateResolvedIp("").valid).toBe(false);
  });

  it("should reject non-IP string", () => {
    expect(validateResolvedIp("not-an-ip").valid).toBe(false);
  });

  it("should reject hostname", () => {
    expect(validateResolvedIp("example.com").valid).toBe(false);
  });
});
