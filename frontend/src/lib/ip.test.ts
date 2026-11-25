import { describe, expect, it } from "vitest";
import { chaveDoIp } from "./ip";

describe("chaveDoIp", () => {
  it("IPv4 vale pelo endereço", () => {
    expect(chaveDoIp("203.0.113.7")).toBe("203.0.113.7");
    expect(chaveDoIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("IPv6 do mesmo /64 dá a mesma chave, escrito de qualquer jeito", () => {
    const chave = chaveDoIp("2001:db8:1:2::1");
    expect(chave).toBe("2001:db8:1:2::/64");
    expect(chaveDoIp("2001:0DB8:0001:0002:ffff:eeee:dddd:cccc")).toBe(chave);
    expect(chaveDoIp("[2001:db8:1:2::abcd]")).toBe(chave);
    expect(chaveDoIp("2001:db8:1:2::abcd%eth0")).toBe(chave);
    expect(chaveDoIp("2001:db8:1:3::1")).not.toBe(chave);
    expect(chaveDoIp("::1")).toBe("0:0:0:0::/64");
  });

  it("valor estranho fica como veio", () => {
    expect(chaveDoIp("desconhecido")).toBe("desconhecido");
    expect(chaveDoIp("zz::1")).toBe("zz::1");
  });
});
