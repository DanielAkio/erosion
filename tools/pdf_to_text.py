#!/usr/bin/env python3
"""
Converte um PDF escaneado (somente imagens) em texto usando OCR.

Usa RapidOCR (onnxruntime), que e autocontido e NAO precisa de pacotes
de sistema (sem sudo). A renderizacao das paginas usa pdf2image/poppler
(pdftoppm) que ja esta disponivel no sistema.

Uso: python pdf_to_text.py "Erosion - Regras.pdf" -o regras.txt
"""
import argparse
import sys
from pathlib import Path

try:
    import numpy as np
    from pdf2image import convert_from_path
    from rapidocr_onnxruntime import RapidOCR
except ImportError as exc:
    sys.exit(
        f"Dependencia faltando ({exc.name}). Instale com:\n"
        "  python3 -m pip install --user rapidocr-onnxruntime pdf2image pillow"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="OCR de PDF para texto")
    parser.add_argument("pdf", help="Caminho do PDF de entrada")
    parser.add_argument("-o", "--output", default="regras.txt",
                        help="Arquivo de texto de saida")
    parser.add_argument("--dpi", type=int, default=200,
                        help="Resolucao de renderizacao das paginas")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        sys.exit(f"Arquivo nao encontrado: {pdf_path}")

    print(f"Renderizando paginas de '{pdf_path}' a {args.dpi} DPI...")
    pages = convert_from_path(str(pdf_path), dpi=args.dpi)

    print("Carregando motor de OCR (RapidOCR)...")
    engine = RapidOCR()

    texto_total = []
    for i, page in enumerate(pages, start=1):
        print(f"OCR na pagina {i}/{len(pages)}...")
        result, _ = engine(np.array(page))
        if result:
            linhas = [item[1] for item in result]
            texto = "\n".join(linhas)
        else:
            texto = ""
        texto_total.append(f"\n===== PAGINA {i} =====\n{texto}")

    saida = Path(args.output)
    saida.write_text("\n".join(texto_total), encoding="utf-8")
    print(f"Pronto! Texto salvo em: {saida.resolve()}")


if __name__ == "__main__":
    main()
