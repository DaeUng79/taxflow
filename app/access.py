"""Validate the configured local address and same-origin API requests."""
import ipaddress

PRIVATE_NETWORKS = tuple(ipaddress.ip_network(value) for value in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"
))


def bind_address(value):
    if not value:
        return "127.0.0.1"
    try:
        address = ipaddress.IPv4Address(value)
    except ipaddress.AddressValueError as exc:
        raise ValueError("TAXFLOW_LAN_IP에는 서버 컴퓨터의 사설 IPv4 주소를 입력하세요.") from exc
    if not any(address in network for network in PRIVATE_NETWORKS):
        raise ValueError("TAXFLOW_LAN_IP에는 10.x, 172.16~31.x 또는 192.168.x 사설 IPv4 주소를 입력하세요.")
    return str(address)


def allowed_request(handler):
    port = handler.server.server_port
    addresses = {"127.0.0.1", "localhost"}
    address = getattr(handler.server, "taxflow_bind_address", "127.0.0.1")
    if address != "127.0.0.1":
        addresses.add(address)
    hosts = {f"{item}:{port}" for item in addresses}
    host = handler.headers.get("Host", "")
    origin = handler.headers.get("Origin")
    return host in hosts and (not origin or origin == f"http://{host}")
