import 'package:flutter/material.dart';

/// Cor é reforço: cada resposta também tem forma, posição e áudio fixos (escopo, seção 5).
abstract final class ZeloColors {
  static const ok = Color(0xFF1B5E20);
  static const problem = Color(0xFFF9A825);
  static const blocked = Color(0xFF1565C0);
  /// "Não sei": neutro, para não parecer problema nem impedimento.
  static const skip = Color(0xFF546E7A);
  static const scan = Color(0xFF6A1B9A);

  /// Câmera usa o roxo da etiqueta (as duas abrem a câmera); microfone é laranja.
  static const photo = scan;
  static const mic = Color(0xFFE65100);
  static const overdue = Color(0xFFB71C1C);

  /// Devolvida pelo gestor: escura para não se confundir com nenhum botão de resposta.
  static const returned = ink;
  static const surface = Color(0xFFF5F5F0);
  static const ink = Color(0xFF111111);
}

/// Alvos de toque: mínimo 48 dp; meta de 64 dp nos botões de resposta.
abstract final class ZeloSizes {
  static const responseHeight = 88.0;
  static const minTouch = 64.0;
  static const gutter = 16.0;
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1565C0), surface: ZeloColors.surface),
    scaffoldBackgroundColor: ZeloColors.surface,
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: ZeloColors.ink, displayColor: ZeloColors.ink).copyWith(
          titleLarge: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: ZeloColors.ink),
          titleMedium: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: ZeloColors.ink),
          bodyLarge: const TextStyle(fontSize: 20, color: ZeloColors.ink),
        ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(ZeloSizes.minTouch, ZeloSizes.minTouch),
        textStyle: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
      ),
    ),
  );
}
