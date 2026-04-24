using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace ClassroomAgent;

// Runs inside the interactive user session (spawned by MessageDispatcher via CreateProcessAsUser).
// Writes base64 JPEG to stdout and exits.
internal static class ScreenCapture
{
    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    internal static string CaptureBase64Jpeg()
    {
        int w = GetSystemMetrics(0);
        int h = GetSystemMetrics(1);
        using var bmp = new Bitmap(w, h);
        using var gfx = Graphics.FromImage(bmp);
        gfx.CopyFromScreen(0, 0, 0, 0, new Size(w, h));

        Bitmap final = bmp;
        if (w > 1280)
        {
            int newH = (int)(h * 1280.0 / w);
            final = new Bitmap(bmp, new Size(1280, newH));
        }

        using var ms = new MemoryStream();
        var jpegEncoder = ImageCodecInfo.GetImageEncoders()
            .First(e => e.FormatID == ImageFormat.Jpeg.Guid);
        using var ep = new EncoderParameters(1);
        ep.Param[0] = new EncoderParameter(Encoder.Quality, 75L);
        final.Save(ms, jpegEncoder, ep);
        if (!ReferenceEquals(final, bmp)) final.Dispose();

        return Convert.ToBase64String(ms.ToArray());
    }
}
