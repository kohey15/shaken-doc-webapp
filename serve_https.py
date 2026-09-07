"""動作確認用の一時的なHTTPS静的サーバー。

このアプリ本体はPC/サーバーを必要としない設計だが、実際の公開ホスティング先を
決めるまでの間、開発中のこのPCを使ってスマホから動作確認できるようにするための
補助スクリプト。本番運用でこのPCを使い続ける想定ではない。

自己署名証明書を生成してHTTPS配信する(Web Share Target・Service Workerは
セキュアコンテキストが必須のため)。スマホは初回アクセス時にブラウザの警告を
読み進める必要がある(通常のこと)。
"""

from __future__ import annotations

import datetime
import http.server
import ipaddress
import socket
import ssl
from pathlib import Path

import qrcode
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

PORT = 8901
BASE_DIR = Path(__file__).resolve().parent
CERT_FILE = BASE_DIR / "_dev_cert.pem"
KEY_FILE = BASE_DIR / "_dev_key.pem"


def get_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert(lan_ip: str) -> None:
    if CERT_FILE.exists() and KEY_FILE.exists():
        return
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "ShakenDocWebApp (dev)")])
    san = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    try:
        san.append(x509.IPAddress(ipaddress.ip_address(lan_ip)))
    except ValueError:
        pass
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .sign(key, hashes.SHA256())
    )
    KEY_FILE.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    CERT_FILE.write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def main() -> None:
    lan_ip = get_lan_ip()
    ensure_cert(lan_ip)
    url = f"https://{lan_ip}:{PORT}/"

    qr_path = BASE_DIR / "_dev_qr.png"
    img = qrcode.make(url)
    img.save(qr_path)
    print("=" * 60)
    print(" Shaken Doc WebApp (dev preview server)")
    print("=" * 60)
    print(f" URL: {url}")
    print(f" QR image saved to: {qr_path}")
    print(" Close this window to stop the server.")
    print("=" * 60)

    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(*a, directory=str(BASE_DIR), **kw)
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
