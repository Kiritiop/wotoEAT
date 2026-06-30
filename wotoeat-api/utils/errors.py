"""
Shared HTTP error helper.

Routers wrap their DB/AI calls in `try/except Exception` and historically
returned the raw exception text to the client (``detail=f"...: {exc}"``). That
leaks internal details — DB driver messages, table names, stack fragments — to
anyone hitting the API. This helper logs the full exception server-side (with
traceback) and returns a generic, user-safe HTTP 500 instead.

Call it *inside* an ``except`` block so ``logger.exception`` captures the
active traceback:

    except Exception as exc:
        raise server_error("meals.generate", exc)
"""
import logging

from fastapi import HTTPException

logger = logging.getLogger("wotoeat")


def server_error(
    context: str,
    exc: Exception,
    message: str = "Something went wrong. Please try again.",
) -> HTTPException:
    """Log `exc` (with traceback) under `context` and return a generic 500.

    The returned HTTPException never carries the original exception text, so
    internal details are not disclosed to the client.
    """
    logger.exception("[%s] %s", context, exc)
    return HTTPException(status_code=500, detail=message)
