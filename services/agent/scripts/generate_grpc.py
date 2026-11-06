"""Generate Python gRPC stubs from `proto/agent.proto`.

Run from anywhere:

    python services/agent/scripts/generate_grpc.py

The generated files are committed so the service runs without protoc installed.
"""

import sys
import tempfile
from pathlib import Path

from grpc_tools import protoc

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parents[2]
PROTO_DIR = PROJECT_ROOT / "proto"
OUT_DIR = SCRIPT_DIR.parent / "app" / "grpc_generated"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        exit_code = protoc.main(
            [
                "grpc_tools.protoc",
                f"-I{PROTO_DIR}",
                f"--python_out={temp_dir}",
                f"--pyi_out={temp_dir}",
                f"--grpc_python_out={temp_dir}",
                str(PROTO_DIR / "agent.proto"),
            ]
        )
        if exit_code != 0:
            print("protoc failed", file=sys.stderr)
            return exit_code

        for name in ("agent_pb2.py", "agent_pb2.pyi", "agent_pb2_grpc.py"):
            source = Path(temp_dir) / name
            if not source.exists():
                continue

            text = source.read_text(encoding="utf-8")
            if name == "agent_pb2_grpc.py":
                # grpc_tools emits a top-level import; make it package-relative.
                text = text.replace(
                    "import agent_pb2 as agent__pb2",
                    "from . import agent_pb2 as agent__pb2",
                )
            (OUT_DIR / name).write_text(text, encoding="utf-8")

    (OUT_DIR / "__init__.py").write_text(
        '"""Generated from proto/agent.proto — do not edit by hand."""\n',
        encoding="utf-8",
    )
    print(f"generated stubs in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
