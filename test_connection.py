"""
Quick connectivity + stock inventory smoke test for Odoo Online's External API.

Usage:
    pip install -r requirements.txt
    fill in .env
    python test_connection.py
"""

import os
import sys
import xmlrpc.client

from dotenv import load_dotenv

load_dotenv()

URL = os.getenv("ODOO_URL", "").rstrip("/")
DB = os.getenv("ODOO_DB", "")
USERNAME = os.getenv("ODOO_USERNAME", "")
API_KEY = os.getenv("ODOO_API_KEY", "")


def main():
    missing = [name for name, val in (
        ("ODOO_URL", URL), ("ODOO_DB", DB),
        ("ODOO_USERNAME", USERNAME), ("ODOO_API_KEY", API_KEY),
    ) if not val]
    if missing:
        print(f"Missing values in .env: {', '.join(missing)}")
        sys.exit(1)

    common = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/common")
    version = common.version()
    print("Server version:", version)

    uid = common.authenticate(DB, USERNAME, API_KEY, {})
    if not uid:
        print("Authentication failed. Check ODOO_DB / ODOO_USERNAME / ODOO_API_KEY.")
        sys.exit(1)
    print(f"Authenticated as uid={uid}")

    models = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/object")

    # Products with quantity on hand (Odoo 17+ uses is_storable instead of type='product')
    products = models.execute_kw(
        DB, uid, API_KEY,
        "product.product", "search_read",
        [[["is_storable", "=", True]]],
        {"fields": ["display_name", "qty_available", "virtual_available"], "limit": 10},
    )
    print(f"\nSample products ({len(products)}):")
    for p in products:
        print(f"  {p['display_name']!r}: on hand={p['qty_available']}, forecast={p['virtual_available']}")

    # Raw on-hand quants per location
    quants = models.execute_kw(
        DB, uid, API_KEY,
        "stock.quant", "search_read",
        [[["location_id.usage", "=", "internal"], ["quantity", "!=", 0]]],
        {"fields": ["product_id", "location_id", "quantity", "reserved_quantity"], "limit": 10},
    )
    print(f"\nSample stock.quant records ({len(quants)}):")
    for q in quants:
        print(f"  {q['product_id'][1]!r} @ {q['location_id'][1]!r}: qty={q['quantity']}, reserved={q['reserved_quantity']}")


if __name__ == "__main__":
    main()
