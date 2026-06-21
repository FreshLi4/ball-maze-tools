#include "P4CommandLineSourceControlProvider.h"
#include "P4CommandLineSourceControlState.h"
#include "P4CommandLineSourceControlUtils.h"
#include "P4CommandLineSourceControlSettings.h"
#include "SourceControlModule.h"
#include "SourceControlHelpers.h"
#include "SourceControlOperations.h"
#include "Misc/Paths.h"
#include "Misc/FeedbackContext.h"

#define LOCTEXT_NAMESPACE "P4CommandLineSourceControl"

FP4CommandLineSourceControlProvider::FP4CommandLineSourceControlProvider()
    : ProviderName(FName("P4CommandLine"))
{
}

void FP4CommandLineSourceControlProvider::Init(bool bForceConnection)
{
    if (bForceConnection)
    {
        CheckP4Availability();
    }
}

void FP4CommandLineSourceControlProvider::Close()
{
    bSourceControlAvailable = false;
    CachedStates.Empty();
}

bool FP4CommandLineSourceControlProvider::IsAvailable() const
{
    return bSourceControlAvailable;
}

bool FP4CommandLineSourceControlProvider::IsEnabled() const
{
    return bSourceControlAvailable;
}

bool FP4CommandLineSourceControlProvider::IsAuthenticated() const
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    if (FP4CommandLineSourceControlUtils::RunP4Command(TEXT("info"), TEXT(""), Results, Errors, ReturnCode))
    {
        return ReturnCode == 0;
    }
    return false;
}

const FName& FP4CommandLineSourceControlProvider::GetName() const
{
    return ProviderName;
}

FText FP4CommandLineSourceControlProvider::GetDisplayName() const
{
    return LOCTEXT("P4CommandLineDisplayName", "Perforce CLI");
}

FText FP4CommandLineSourceControlProvider::GetStatusText() const
{
    if (IsAvailable())
    {
        return LOCTEXT("P4CommandLineAvailable", "Connected to Perforce (CLI)");
    }
    return LOCTEXT("P4CommandLineUnavailable", "Not connected to Perforce (CLI)");
}

bool FP4CommandLineSourceControlProvider::LearnMore(TArray<FString>& OutInfo) const
{
    OutInfo.Add(TEXT("Perforce CLI Source Control Provider"));
    OutInfo.Add(TEXT("Uses the p4 command-line tool instead of libclient to avoid ABI crashes on macOS."));
    OutInfo.Add(TEXT("Requires p4 to be installed and available in the system PATH."));
    return true;
}

bool FP4CommandLineSourceControlProvider::Login(const FString& InUsername, const FString& InPassword, const FSourceControlLoginClosed& InOnSourceControlLoginClosed)
{
    FString Parameters = FString::Printf(TEXT("-u %s -P %s login"), *InUsername, *InPassword);
    FString Results, Errors;
    int32 ReturnCode = 0;
    bool bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("login"), Parameters, Results, Errors, ReturnCode);
    if (bSuccess && ReturnCode == 0)
    {
        bSourceControlAvailable = true;
    }
    return bSuccess && ReturnCode == 0;
}

bool FP4CommandLineSourceControlProvider::Logout()
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    FP4CommandLineSourceControlUtils::RunP4Command(TEXT("logout"), TEXT(""), Results, Errors, ReturnCode);
    return ReturnCode == 0;
}

const TArray<FSourceControlStateRef>& FP4CommandLineSourceControlProvider::GetCachedStateByPredicate(TFunctionRef<bool(const FSourceControlStateRef&)> Predicate) const
{
    static TArray<FSourceControlStateRef> FilteredStates;
    FilteredStates.Empty();
    for (const auto& Pair : CachedStates)
    {
        if (Predicate(Pair.Value))
        {
            FilteredStates.Add(Pair.Value);
        }
    }
    return FilteredStates;
}

FSourceControlStatePtr FP4CommandLineSourceControlProvider::GetState(const FString& Filename, const FName& InBranch) const
{
    const FSourceControlStateRef* State = CachedStates.Find(Filename);
    if (State)
    {
        return *State;
    }
    return nullptr;
}

TArray<FSourceControlStateRef> FP4CommandLineSourceControlProvider::GetState(const TArray<FString>& Filenames, const FName& InBranch)
{
    TArray<FSourceControlStateRef> States;
    for (const FString& Filename : Filenames)
    {
        FSourceControlStatePtr State = GetState(Filename, InBranch);
        if (State.IsValid())
        {
            States.Add(State.ToSharedRef());
        }
    }
    return States;
}

void FP4CommandLineSourceControlProvider::UpdateState(const TArray<FSourceControlStateRef>& InSourceControlStates)
{
    for (const FSourceControlStateRef& State : InSourceControlStates)
    {
        TSharedPtr<FP4CommandLineSourceControlState> P4State = StaticCastSharedPtr<FP4CommandLineSourceControlState>(State);
        if (P4State.IsValid())
        {
            CachedStates.Add(P4State->GetLocalFilename(), P4State.ToSharedRef());
        }
    }
}

bool FP4CommandLineSourceControlProvider::CanCancelOperation() const
{
    return false;
}

void FP4CommandLineSourceControlProvider::CancelOperation()
{
}

bool FP4CommandLineSourceControlProvider::IsOperationValid(const FSourceControlOperationRef& InOperation) const
{
    return true;
}

TSharedRef<class ISourceControlOperation, ESPMode::ThreadSafe> FP4CommandLineSourceControlProvider::CreateOperation(const FName& InOperationName)
{
    if (InOperationName == FCheckOut::GetName())
    {
        return MakeShareable(new FCheckOut);
    }
    else if (InOperationName == FRevert::GetName())
    {
        return MakeShareable(new FRevert);
    }
    else if (InOperationName == FAdd::GetName())
    {
        return MakeShareable(new FAdd);
    }
    else if (InOperationName == FDelete::GetName())
    {
        return MakeShareable(new FDelete);
    }
    else if (InOperationName == FMove::GetName())
    {
        return MakeShareable(new FMove);
    }
    else if (InOperationName == FSync::GetName())
    {
        return MakeShareable(new FSync);
    }
    else if (InOperationName == FUpdateStatus::GetName())
    {
        return MakeShareable(new FUpdateStatus);
    }
    else if (InOperationName == FCheckIn::GetName())
    {
        return MakeShareable(new FCheckIn);
    }
    else if (InOperationName == FHistory::GetName())
    {
        return MakeShareable(new FHistory);
    }
    else if (InOperationName == FAnnotate::GetName())
    {
        return MakeShareable(new FAnnotate);
    }

    return MakeShareable(new FUpdateStatus);
}

bool FP4CommandLineSourceControlProvider::CanExecuteOperation(const FName& InOperationName) const
{
    return true;
}

bool FP4CommandLineSourceControlProvider::Execute(const FSourceControlOperationRef& InOperation, const FSourceControlOperationComplete& InOperationCompleteDelegate, EConcurrency::Type InConcurrency, const FName& InBranch)
{
    if (!IsEnabled())
    {
        InOperationCompleteDelegate.ExecuteIfBound(InOperation, ECommandResult::Failed);
        return false;
    }

    FSourceControlResultInfo ResultInfo;
    InOperation->AppendResultInfo(ResultInfo);

    TArray<FString> Files;
    if (FUpdateStatus* UpdateStatus = InOperation->GetOperation<FUpdateStatus>())
    {
        Files = UpdateStatus->GetFiles();
    }
    else if (FCheckOut* CheckOut = InOperation->GetOperation<FCheckOut>())
    {
        Files = CheckOut->GetFiles();
    }
    else if (FRevert* Revert = InOperation->GetOperation<FRevert>())
    {
        Files = Revert->GetFiles();
    }
    else if (FAdd* Add = InOperation->GetOperation<FAdd>())
    {
        Files = Add->GetFiles();
    }
    else if (FDelete* Delete = InOperation->GetOperation<FDelete>())
    {
        Files = Delete->GetFiles();
    }
    else if (FMove* Move = InOperation->GetOperation<FMove>())
    {
        Files = Move->GetFiles();
    }
    else if (FSync* Sync = InOperation->GetOperation<FSync>())
    {
        Files = Sync->GetFiles();
    }
    else if (FCheckIn* CheckIn = InOperation->GetOperation<FCheckIn>())
    {
        Files = CheckIn->GetFiles();
    }
    else if (FHistory* History = InOperation->GetOperation<FHistory>())
    {
        Files = History->GetFiles();
    }
    else if (FAnnotate* Annotate = InOperation->GetOperation<FAnnotate>())
    {
        Files = Annotate->GetFiles();
    }

    bool bSuccess = false;

    if (InOperation->GetName() == FUpdateStatus::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s\n"), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }

        FString Parameters = FString::Printf(TEXT("-x - fstat -T \"depotFile,clientFile,headRev,haveRev,action,otherOpen,otherOpen0,user\""));
        FString Results, Errors;
        int32 ReturnCode = 0;

        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("fstat"), Parameters, Results, Errors, ReturnCode);
        if (bSuccess && ReturnCode == 0)
        {
            TArray<FSourceControlStateRef> NewStates;
            FP4CommandLineSourceControlUtils::ParseStatusResult(Results, NewStates);
            UpdateState(NewStates);
        }
    }
    else if (InOperation->GetName() == FCheckOut::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("edit"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FRevert::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("revert"), TEXT("-k ") + FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FAdd::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("add"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FDelete::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("delete"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FMove::GetName())
    {
        if (Files.Num() >= 2)
        {
            FString Source = FP4CommandLineSourceControlUtils::SanitizeFilename(Files[0]);
            FString Destination = FP4CommandLineSourceControlUtils::SanitizeFilename(Files[1]);
            FString Results, Errors;
            int32 ReturnCode = 0;
            bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("move"), FString::Printf(TEXT("%s %s"), *Source, *Destination), Results, Errors, ReturnCode);
        }
    }
    else if (InOperation->GetName() == FSync::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("sync"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FCheckIn::GetName())
    {
        FCheckIn* CheckIn = InOperation->GetOperation<FCheckIn>();
        FString Description = CheckIn->GetDescription().ToString();
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        FString Parameters = FString::Printf(TEXT("-d \"%s\" %s"), *Description, *FileList);
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("submit"), Parameters, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FHistory::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("filelog"), TEXT("-l ") + FileList, Results, Errors, ReturnCode);
        if (bSuccess && ReturnCode == 0)
        {
            TArray<FSourceControlRevisionRef> Revisions;
            FP4CommandLineSourceControlUtils::ParseFileLogResult(Results, Revisions);
        }
    }
    else if (InOperation->GetName() == FAnnotate::GetName())
    {
        FString FileList;
        for (const FString& File : Files)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Results, Errors;
        int32 ReturnCode = 0;
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("annotate"), FileList, Results, Errors, ReturnCode);
    }

    ECommandResult::Type Result = bSuccess ? ECommandResult::Succeeded : ECommandResult::Failed;
    InOperationCompleteDelegate.ExecuteIfBound(InOperation, Result);

    return bSuccess;
}

bool FP4CommandLineSourceControlProvider::CanUpdateStatus() const
{
    return true;
}

bool FP4CommandLineSourceControlProvider::UpdateStatus()
{
    return true;
}

bool FP4CommandLineSourceControlProvider::CanDiffAgainstBase(const FString& InFilename) const
{
    return true;
}

bool FP4CommandLineSourceControlProvider::CanDiffAgainstLocal(const FString& InFilename) const
{
    return true;
}

bool FP4CommandLineSourceControlProvider::DiffAgainstBase(const FString& InFilename) const
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    FString Parameters = FString::Printf(TEXT("-f %s"), *FP4CommandLineSourceControlUtils::SanitizeFilename(InFilename));
    FP4CommandLineSourceControlUtils::RunP4Command(TEXT("diff"), Parameters, Results, Errors, ReturnCode);
    return ReturnCode == 0;
}

bool FP4CommandLineSourceControlProvider::DiffAgainstLocal(const FString& InFilename) const
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    FString Parameters = FString::Printf(TEXT("%s"), *FP4CommandLineSourceControlUtils::SanitizeFilename(InFilename));
    FP4CommandLineSourceControlUtils::RunP4Command(TEXT("diff"), Parameters, Results, Errors, ReturnCode);
    return ReturnCode == 0;
}

bool FP4CommandLineSourceControlProvider::GetHistory(const FString& InFilename, TArray<FSourceControlRevisionRef>& OutHistory)
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    FString Parameters = FString::Printf(TEXT("-l %s"), *FP4CommandLineSourceControlUtils::SanitizeFilename(InFilename));
    bool bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("filelog"), Parameters, Results, Errors, ReturnCode);
    if (bSuccess && ReturnCode == 0)
    {
        FP4CommandLineSourceControlUtils::ParseFileLogResult(Results, OutHistory);
    }
    return bSuccess && ReturnCode == 0;
}

bool FP4CommandLineSourceControlProvider::CanUpdateHistory() const
{
    return true;
}

bool FP4CommandLineSourceControlProvider::UpdateHistory()
{
    return true;
}

bool FP4CommandLineSourceControlProvider::GetWorkspaces(TArray<FString>& OutWorkspaces)
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    bool bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("clients"), TEXT(""), Results, Errors, ReturnCode);
    if (bSuccess && ReturnCode == 0)
    {
        TArray<FString> Lines;
        Results.ParseIntoArray(Lines, TEXT("\n"), true);
        for (const FString& Line : Lines)
        {
            FString Trimmed = Line.TrimStartAndEnd();
            if (Trimmed.StartsWith(TEXT("Client ")))
            {
                FString ClientName = Trimmed.Replace(TEXT("Client "), TEXT("")).TrimStartAndEnd();
                OutWorkspaces.Add(ClientName);
            }
        }
    }
    return bSuccess && ReturnCode == 0;
}

bool FP4CommandLineSourceControlProvider::SwitchWorkspace(const FString& InWorkspaceName)
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    FString Parameters = FString::Printf(TEXT("%s"), *InWorkspaceName);
    bool bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("client"), Parameters, Results, Errors, ReturnCode);
    return bSuccess && ReturnCode == 0;
}

bool FP4CommandLineSourceControlProvider::CheckP4Availability()
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    bSourceControlAvailable = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("info"), TEXT(""), Results, Errors, ReturnCode) && (ReturnCode == 0);
    return bSourceControlAvailable;
}

bool FP4CommandLineSourceControlProvider::ExecuteSynchronousCommand(FP4CommandLineSourceControlCommand& InCommand, const FText& TaskName)
{
    return InCommand.RunCommand();
}

bool FP4CommandLineSourceControlProvider::ExecuteAsynchronousCommand(FP4CommandLineSourceControlCommand& InCommand)
{
    return InCommand.RunCommand();
}

void FP4CommandLineSourceControlProvider::RegisterWorker(const FName& InName, FGetP4SourceControlWorker InDelegate)
{
    WorkersMap.Add(InName, InDelegate);
}

#undef LOCTEXT_NAMESPACE
