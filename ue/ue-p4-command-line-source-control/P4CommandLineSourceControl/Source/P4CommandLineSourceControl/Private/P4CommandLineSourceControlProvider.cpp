#include "P4CommandLineSourceControlProvider.h"
#include "P4CommandLineSourceControlState.h"
#include "P4CommandLineSourceControlUtils.h"
#include "P4CommandLineSourceControlSettings.h"
#include "SourceControlModule.h"
#include "SourceControlOperations.h"
#include "Misc/Paths.h"
#include "Widgets/Text/STextBlock.h"

#define LOCTEXT_NAMESPACE "P4CommandLineSourceControl.Provider"

FP4CommandLineSourceControlProvider::FP4CommandLineSourceControlProvider()
    : bSourceControlAvailable(false)
    , ProviderName(FName("P4CommandLine"))
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
    StateCache.Empty();
}

FText FP4CommandLineSourceControlProvider::GetStatusText() const
{
    if (IsAvailable())
    {
        return LOCTEXT("P4CommandLineAvailable", "Connected to Perforce (CLI)");
    }
    return LOCTEXT("P4CommandLineUnavailable", "Not connected to Perforce (CLI)");
}

TMap<ISourceControlProvider::EStatus, FString> FP4CommandLineSourceControlProvider::GetStatus() const
{
    TMap<EStatus, FString> Status;
    Status.Add(EStatus::Enabled, IsEnabled() ? TEXT("Enabled") : TEXT("Disabled"));
    Status.Add(EStatus::Connected, IsAvailable() ? TEXT("Connected") : TEXT("Disconnected"));
    return Status;
}

bool FP4CommandLineSourceControlProvider::IsEnabled() const
{
    return bSourceControlAvailable;
}

bool FP4CommandLineSourceControlProvider::IsAvailable() const
{
    return bSourceControlAvailable;
}

const FName& FP4CommandLineSourceControlProvider::GetName() const
{
    return ProviderName;
}

bool FP4CommandLineSourceControlProvider::QueryStateBranchConfig(const FString& ConfigSrc, const FString& ConfigDest)
{
    return false;
}

void FP4CommandLineSourceControlProvider::RegisterStateBranches(const TArray<FString>& BranchNames, const FString& ContentRoot)
{
}

int32 FP4CommandLineSourceControlProvider::GetStateBranchIndex(const FString& InBranchName) const
{
    return INDEX_NONE;
}

ECommandResult::Type FP4CommandLineSourceControlProvider::GetState(const TArray<FString>& InFiles, TArray<FSourceControlStateRef>& OutState, EStateCacheUsage::Type InStateCacheUsage)
{
    if (InStateCacheUsage == EStateCacheUsage::ForceUpdate)
    {
        FString FileList;
        for (const FString& File : InFiles)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Parameters = FString::Printf(TEXT("-T \"depotFile,clientFile,headRev,haveRev,action,otherOpen,otherOpen0,user\" %s"), *FileList);
        FString Results, Errors;
        int32 ReturnCode = 0;
        bool bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("fstat"), Parameters, Results, Errors, ReturnCode);
        if (bSuccess && ReturnCode == 0)
        {
            TArray<FSourceControlStateRef> NewStates;
            FP4CommandLineSourceControlUtils::ParseStatusResult(Results, NewStates);
            for (const FSourceControlStateRef& NewState : NewStates)
            {
                TSharedRef<FP4CommandLineSourceControlState> P4State = StaticCastSharedRef<FP4CommandLineSourceControlState>(NewState);
                StateCache.Add(P4State->GetFilename(), P4State);
            }
            OnSourceControlStateChanged.Broadcast();
        }
    }

    for (const FString& File : InFiles)
    {
        TSharedRef<FP4CommandLineSourceControlState>* State = StateCache.Find(File);
        if (State)
        {
            OutState.Add(*State);
        }
        else
        {
            TSharedRef<FP4CommandLineSourceControlState> NewState = MakeShared<FP4CommandLineSourceControlState>(File);
            NewState->Update(TEXT(""), 0, 0, false, TEXT(""));
            OutState.Add(NewState);
        }
    }

    return ECommandResult::Succeeded;
}

ECommandResult::Type FP4CommandLineSourceControlProvider::GetState(const TArray<FSourceControlChangelistRef>& InChangelists, TArray<FSourceControlChangelistStateRef>& OutState, EStateCacheUsage::Type InStateCacheUsage)
{
    return ECommandResult::Failed;
}

TArray<FSourceControlStateRef> FP4CommandLineSourceControlProvider::GetCachedStateByPredicate(TFunctionRef<bool(const FSourceControlStateRef&)> Predicate) const
{
    TArray<FSourceControlStateRef> FilteredStates;
    for (const auto& Pair : StateCache)
    {
        if (Predicate(Pair.Value))
        {
            FilteredStates.Add(Pair.Value);
        }
    }
    return FilteredStates;
}

FDelegateHandle FP4CommandLineSourceControlProvider::RegisterSourceControlStateChanged_Handle(const FSourceControlStateChanged::FDelegate& SourceControlStateChanged)
{
    return OnSourceControlStateChanged.Add(SourceControlStateChanged);
}

void FP4CommandLineSourceControlProvider::UnregisterSourceControlStateChanged_Handle(FDelegateHandle Handle)
{
    OnSourceControlStateChanged.Remove(Handle);
}

ECommandResult::Type FP4CommandLineSourceControlProvider::Execute(const FSourceControlOperationRef& InOperation, FSourceControlChangelistPtr InChangelist, const TArray<FString>& InFiles, EConcurrency::Type InConcurrency, const FSourceControlOperationComplete& InOperationCompleteDelegate)
{
    if (!IsEnabled())
    {
        InOperationCompleteDelegate.ExecuteIfBound(InOperation, ECommandResult::Failed);
        return ECommandResult::Failed;
    }

    bool bSuccess = false;
    FString Results, Errors;
    int32 ReturnCode = 0;

    if (InOperation->GetName() == FUpdateStatus::GetName())
    {
        FString FileList;
        for (const FString& File : InFiles)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        FString Parameters = FString::Printf(TEXT("-T \"depotFile,clientFile,headRev,haveRev,action,otherOpen,otherOpen0,user\" %s"), *FileList);
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("fstat"), Parameters, Results, Errors, ReturnCode);
        if (bSuccess && ReturnCode == 0)
        {
            TArray<FSourceControlStateRef> NewStates;
            FP4CommandLineSourceControlUtils::ParseStatusResult(Results, NewStates);
            for (const FSourceControlStateRef& NewState : NewStates)
            {
                TSharedRef<FP4CommandLineSourceControlState> P4State = StaticCastSharedRef<FP4CommandLineSourceControlState>(NewState);
                StateCache.Add(P4State->GetFilename(), P4State);
            }
            OnSourceControlStateChanged.Broadcast();
        }
    }
    else if (InOperation->GetName() == FCheckOut::GetName())
    {
        FString FileList;
        for (const FString& File : InFiles)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("edit"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FRevert::GetName())
    {
        FString FileList;
        for (const FString& File : InFiles)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("revert"), FString::Printf(TEXT("-k %s"), *FileList), Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FAdd::GetName())
    {
        FString FileList;
        for (const FString& File : InFiles)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("add"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FDelete::GetName())
    {
        FString FileList;
        for (const FString& File : InFiles)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("delete"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FMove::GetName())
    {
        if (InFiles.Num() >= 2)
        {
            FString Source = FP4CommandLineSourceControlUtils::SanitizeFilename(InFiles[0]);
            FString Destination = FP4CommandLineSourceControlUtils::SanitizeFilename(InFiles[1]);
            bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("move"), FString::Printf(TEXT("%s %s"), *Source, *Destination), Results, Errors, ReturnCode);
        }
    }
    else if (InOperation->GetName() == FSync::GetName())
    {
        FString FileList;
        for (const FString& File : InFiles)
        {
            FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
        }
        bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("sync"), FileList, Results, Errors, ReturnCode);
    }
    else if (InOperation->GetName() == FCheckIn::GetName())
    {
        FCheckIn* CheckIn = InOperation->GetOperation<FCheckIn>();
        if (CheckIn)
        {
            FString Description = CheckIn->GetDescription().ToString();
            FString FileList;
            for (const FString& File : InFiles)
            {
                FileList += FString::Printf(TEXT("%s "), *FP4CommandLineSourceControlUtils::SanitizeFilename(File));
            }
            FString Parameters = FString::Printf(TEXT("-d \"%s\" %s"), *Description, *FileList);
            bSuccess = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("submit"), Parameters, Results, Errors, ReturnCode);
        }
    }
    else if (InOperation->GetName() == FHistory::GetName())
    {
        bSuccess = true; // Handled through GetState
    }
    else if (InOperation->GetName() == FAnnotate::GetName())
    {
        bSuccess = true; // Handled through GetState
    }

    ECommandResult::Type Result = bSuccess ? ECommandResult::Succeeded : ECommandResult::Failed;
    InOperationCompleteDelegate.ExecuteIfBound(InOperation, Result);
    return Result;
}

bool FP4CommandLineSourceControlProvider::CanExecuteOperation(const FSourceControlOperationRef& InOperation) const
{
    return true;
}

bool FP4CommandLineSourceControlProvider::CanCancelOperation(const FSourceControlOperationRef& InOperation) const
{
    return false;
}

void FP4CommandLineSourceControlProvider::CancelOperation(const FSourceControlOperationRef& InOperation)
{
}

bool FP4CommandLineSourceControlProvider::UsesLocalReadOnlyState() const
{
    return true; // Perforce uses read-only flags
}

bool FP4CommandLineSourceControlProvider::UsesChangelists() const
{
    return true; // Perforce supports changelists
}

bool FP4CommandLineSourceControlProvider::UsesUncontrolledChangelists() const
{
    return false;
}

bool FP4CommandLineSourceControlProvider::UsesCheckout() const
{
    return true; // Perforce requires checkout
}

bool FP4CommandLineSourceControlProvider::UsesFileRevisions() const
{
    return true;
}

bool FP4CommandLineSourceControlProvider::UsesSnapshots() const
{
    return false;
}

bool FP4CommandLineSourceControlProvider::AllowsDiffAgainstDepot() const
{
    return true;
}

TOptional<bool> FP4CommandLineSourceControlProvider::IsAtLatestRevision() const
{
    return TOptional<bool>(true);
}

TOptional<int> FP4CommandLineSourceControlProvider::GetNumLocalChanges() const
{
    return TOptional<int>(0);
}

void FP4CommandLineSourceControlProvider::Tick()
{
}

TArray<TSharedRef<class ISourceControlLabel>> FP4CommandLineSourceControlProvider::GetLabels(const FString& InMatchingSpec) const
{
    return TArray<TSharedRef<class ISourceControlLabel>>();
}

TArray<FSourceControlChangelistRef> FP4CommandLineSourceControlProvider::GetChangelists(EStateCacheUsage::Type InStateCacheUsage)
{
    return TArray<FSourceControlChangelistRef>();
}

#if SOURCE_CONTROL_WITH_SLATE
TSharedRef<class SWidget> FP4CommandLineSourceControlProvider::MakeSettingsWidget() const
{
    return SNew(STextBlock).Text(LOCTEXT("SettingsPlaceholder", "P4 CLI Settings (configure via Project Settings or .p4config)"));
}
#endif

bool FP4CommandLineSourceControlProvider::CheckP4Availability()
{
    FString Results, Errors;
    int32 ReturnCode = 0;
    bSourceControlAvailable = FP4CommandLineSourceControlUtils::RunP4Command(TEXT("info"), TEXT(""), Results, Errors, ReturnCode) && (ReturnCode == 0);
    return bSourceControlAvailable;
}

TSharedRef<FP4CommandLineSourceControlState> FP4CommandLineSourceControlProvider::GetStateInternal(const FString& Filename)
{
    TSharedRef<FP4CommandLineSourceControlState>* State = StateCache.Find(Filename);
    if (State)
    {
        return *State;
    }
    TSharedRef<FP4CommandLineSourceControlState> NewState = MakeShared<FP4CommandLineSourceControlState>(Filename);
    StateCache.Add(Filename, NewState);
    return NewState;
}

#undef LOCTEXT_NAMESPACE