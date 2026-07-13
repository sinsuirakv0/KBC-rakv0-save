using System;
using System.Drawing;

public static class WoodMatcher {
    public static string Find(string shotPath, string sourcePath) {
        using var shot = new Bitmap(shotPath);
        using var source = new Bitmap(sourcePath);
        double best = double.MaxValue;
        double bestScale = 0;
        int bestPhase = 0;
        int bestSign = 0;
        int bestWidth = 0;
        for (int woodWidth = 96; woodWidth <= 100; woodWidth++) {
            double scaleX = woodWidth / 48.0;
            for (int sign = -1; sign <= 1; sign += 2) {
                for (double scaleY = 0.50; scaleY <= 2.50; scaleY += 0.05) {
                    for (int phase = 0; phase < 378; phase += 4) {
                        double error = 0;
                        int count = 0;
                        for (int y = 2; y < 574; y += 6) {
                            int u = Mod((int)Math.Round(phase + sign * y / scaleY), 378);
                            for (int x = 2; x < woodWidth - 2; x += 6) {
                                int v = Math.Clamp((int)Math.Round(x / scaleX), 0, 47);
                                Color a = shot.GetPixel(x, y);
                                Color b = source.GetPixel(483 + u, 12 + v);
                                int dr = a.R - b.R;
                                int dg = a.G - b.G;
                                int db = a.B - b.B;
                                error += dr * dr + dg * dg + db * db;
                                count++;
                            }
                        }
                        error /= count;
                        if (error < best) {
                            best = error;
                            bestScale = scaleY;
                            bestPhase = phase;
                            bestSign = sign;
                            bestWidth = woodWidth;
                        }
                    }
                }
            }
        }
        return $"MSE={best:F3}; width={bestWidth}; scaleY={bestScale:F3}; phase={bestPhase}; sign={bestSign}";
    }

    private static int Mod(int value, int modulus) {
        int result = value % modulus;
        return result < 0 ? result + modulus : result;
    }
}
