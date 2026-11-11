import 'package:flutter/material.dart';

/// Marca do Zelar: o escudo com o Z de frontend/src/app/icon.svg, nas mesmas medidas.
/// Desenhada em código, e não como imagem, para já existir no primeiro quadro da abertura.
class ZelarLogo extends StatelessWidget {
  const ZelarLogo({super.key, required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: const _LogoPainter());
}

/// Logo e nome lado a lado. O texto segue o tamanho de fonte do celular.
class ZelarBrand extends StatelessWidget {
  const ZelarBrand({super.key, this.logoSize = 44});

  final double logoSize;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Zelar',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ZelarLogo(size: logoSize),
          const SizedBox(width: 8),
          const Flexible(child: ZelarName(fontSize: 26)),
        ],
      ),
    );
  }
}

class ZelarName extends StatelessWidget {
  const ZelarName({super.key, required this.fontSize});

  final double fontSize;

  @override
  Widget build(BuildContext context) => Text(
        'Zelar',
        maxLines: 1,
        softWrap: false,
        overflow: TextOverflow.fade,
        style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w300, letterSpacing: fontSize * 0.06, color: const Color(0xFF0B1736)),
      );
}

class _LogoPainter extends CustomPainter {
  const _LogoPainter();

  static final Path _shield = Path()
    ..moveTo(16, 2.2)
    ..lineTo(27.2, 6.3)
    ..relativeLineTo(0, 8.6)
    ..relativeCubicTo(0, 7.1, -4.7, 12.3, -11.2, 14.9)
    ..cubicTo(9.5, 27.2, 4.8, 22, 4.8, 14.9)
    ..lineTo(4.8, 6.3)
    ..close();

  static final Path _letter = Path()
    ..moveTo(10.6, 9.4)
    ..relativeLineTo(10.8, 0)
    ..relativeLineTo(0, 2.3)
    ..relativeLineTo(-7.3, 7.9)
    ..relativeLineTo(7.3, 0)
    ..relativeLineTo(0, 2.5)
    ..lineTo(10.6, 22.1)
    ..relativeLineTo(0, -2.3)
    ..relativeLineTo(7.3, -7.9)
    ..relativeLineTo(-7.3, 0)
    ..close();

  static const _diagonal = (begin: Alignment.topLeft, end: Alignment.bottomRight);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 32);
    final bounds = _shield.getBounds();
    canvas.drawPath(
      _shield,
      Paint()
        ..shader = LinearGradient(
          begin: _diagonal.begin,
          end: _diagonal.end,
          colors: const [Color(0xFF1E3A8A), Color(0xFF0B1736)],
        ).createShader(bounds),
    );
    canvas.drawPath(
      _shield,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.3
        ..strokeJoin = StrokeJoin.round
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFFFFFF), Color(0xFF93B4FF)],
        ).createShader(bounds),
    );
    canvas.drawPath(
      _letter,
      Paint()
        ..shader = LinearGradient(
          begin: _diagonal.begin,
          end: _diagonal.end,
          colors: const [Color(0xFFFFFFFF), Color(0xFFC7D7FF)],
        ).createShader(_letter.getBounds()),
    );
  }

  @override
  bool shouldRepaint(_LogoPainter oldDelegate) => false;
}
