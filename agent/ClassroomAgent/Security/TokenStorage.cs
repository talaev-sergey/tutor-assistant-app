using System.Security.Cryptography;
using System.Text;

namespace ClassroomAgent.Security;

public class TokenStorage
{
    private static readonly string StoragePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "ClassroomAgent", "token.dat");

    public void Save(string plainToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StoragePath)!);
        var encrypted = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(plainToken),
            null,
            DataProtectionScope.LocalMachine);
        File.WriteAllBytes(StoragePath, encrypted);
    }

    public string? Load()
    {
        if (!File.Exists(StoragePath)) return null;
        try
        {
            var decrypted = ProtectedData.Unprotect(
                File.ReadAllBytes(StoragePath),
                null,
                DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(decrypted);
        }
        catch
        {
            return null;
        }
    }

    public bool HasToken() => File.Exists(StoragePath);
}
