#include "P4CommandLineSourceControlSettings.h"
#include "HAL/PlatformFilemanager.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/Paths.h"
#include "UObject/ConstructorHelpers.h"

UP4CommandLineSourceControlSettings::UP4CommandLineSourceControlSettings(const FObjectInitializer& ObjectInitializer)
    : Super(ObjectInitializer)
{
    LoadSettings();
}

void UP4CommandLineSourceControlSettings::LoadSettings()
{
    GConfig->GetString(TEXT("PerforceCLI"), TEXT("P4Port"), P4Port, GEditorPerProjectIni);
    GConfig->GetString(TEXT("PerforceCLI"), TEXT("P4User"), P4User, GEditorPerProjectIni);
    GConfig->GetString(TEXT("PerforceCLI"), TEXT("P4Client"), P4Client, GEditorPerProjectIni);
    GConfig->GetString(TEXT("PerforceCLI"), TEXT("P4Password"), P4Password, GEditorPerProjectIni);
    GConfig->GetString(TEXT("PerforceCLI"), TEXT("P4ExecutablePath"), P4ExecutablePath, GEditorPerProjectIni);
    
    // Fallback to environment variables
    if (P4Port.IsEmpty())
    {
        P4Port = FPlatformMisc::GetEnvironmentVariable(TEXT("P4PORT"));
    }
    if (P4User.IsEmpty())
    {
        P4User = FPlatformMisc::GetEnvironmentVariable(TEXT("P4USER"));
    }
    if (P4Client.IsEmpty())
    {
        P4Client = FPlatformMisc::GetEnvironmentVariable(TEXT("P4CLIENT"));
    }
    if (P4Password.IsEmpty())
    {
        P4Password = FPlatformMisc::GetEnvironmentVariable(TEXT("P4PASSWD"));
    }
}

void UP4CommandLineSourceControlSettings::SaveSettings() const
{
    GConfig->SetString(TEXT("PerforceCLI"), TEXT("P4Port"), *P4Port, GEditorPerProjectIni);
    GConfig->SetString(TEXT("PerforceCLI"), TEXT("P4User"), *P4User, GEditorPerProjectIni);
    GConfig->SetString(TEXT("PerforceCLI"), TEXT("P4Client"), *P4Client, GEditorPerProjectIni);
    GConfig->SetString(TEXT("PerforceCLI"), TEXT("P4Password"), *P4Password, GEditorPerProjectIni);
    GConfig->SetString(TEXT("PerforceCLI"), TEXT("P4ExecutablePath"), *P4ExecutablePath, GEditorPerProjectIni);
    GConfig->Flush(false, GEditorPerProjectIni);
}

FString UP4CommandLineSourceControlSettings::GetP4Port() const
{
    return P4Port;
}

FString UP4CommandLineSourceControlSettings::GetP4User() const
{
    return P4User;
}

FString UP4CommandLineSourceControlSettings::GetP4Client() const
{
    return P4Client;
}

FString UP4CommandLineSourceControlSettings::GetP4Password() const
{
    return P4Password;
}

FString UP4CommandLineSourceControlSettings::GetP4ExecutablePath() const
{
    return P4ExecutablePath;
}
