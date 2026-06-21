#include "P4CommandLineSourceControlState.h"
#include "Misc/Paths.h"

#define LOCTEXT_NAMESPACE "P4CommandLineSourceControl"

FName FP4CommandLineSourceControlState::GetStateIcon() const
{
    if (IsCheckedOut())
    {
        return FName("SourceControl.CheckedOut");
    }
    else if (IsAdded())
    {
        return FName("SourceControl.Added");
    }
    else if (IsDeleted())
    {
        return FName("SourceControl.Deleted");
    }
    else if (IsCheckedOutOther())
    {
        return FName("SourceControl.CheckedOutOther");
    }
    else if (IsConflicted())
    {
        return FName("SourceControl.Conflicted");
    }
    else if (IsNew())
    {
        return FName("SourceControl.NotInDepot");
    }
    else if (!IsCurrent())
    {
        return FName("SourceControl.NotAtHeadRevision");
    }
    else
    {
        return FName("SourceControl.CheckedOut");
    }
}

FText FP4CommandLineSourceControlState::GetStateText() const
{
    if (IsCheckedOut())
    {
        return LOCTEXT("CheckedOut", "Checked Out");
    }
    else if (IsAdded())
    {
        return LOCTEXT("Added", "Added");
    }
    else if (IsDeleted())
    {
        return LOCTEXT("Deleted", "Marked for Delete");
    }
    else if (IsCheckedOutOther())
    {
        return LOCTEXT("CheckedOutOther", "Checked Out by Other");
    }
    else if (IsConflicted())
    {
        return LOCTEXT("Conflicted", "Conflicted");
    }
    else if (IsNew())
    {
        return LOCTEXT("New", "Not in Depot");
    }
    else if (!IsCurrent())
    {
        return LOCTEXT("NotCurrent", "Not at Head Revision");
    }
    else
    {
        return LOCTEXT("Current", "Current");
    }
}

FText FP4CommandLineSourceControlState::GetDisplayName() const
{
    return FText::FromString(FPaths::GetCleanFilename(LocalFilename));
}

bool FP4CommandLineSourceControlState::IsCurrent() const
{
    return HeadRevision == HaveRevision && HeadRevision > 0;
}

bool FP4CommandLineSourceControlState::IsSourceControlled() const
{
    return !DepotFilename.IsEmpty();
}

bool FP4CommandLineSourceControlState::IsAdded() const
{
    return Action == TEXT("add");
}

bool FP4CommandLineSourceControlState::IsDeleted() const
{
    return Action == TEXT("delete");
}

bool FP4CommandLineSourceControlState::IsCheckedOut() const
{
    return Action == TEXT("edit") || Action == TEXT("add") || Action == TEXT("delete") || Action == TEXT("branch") || Action == TEXT("integrate");
}

bool FP4CommandLineSourceControlState::IsCheckedOutOther(FString* OtherUserName) const
{
    if (bOtherOpen && OtherUserName)
    {
        *OtherUserName = OtherUserCheckedOut;
    }
    return bOtherOpen;
}

bool FP4CommandLineSourceControlState::IsModified() const
{
    return IsCheckedOut() || IsAdded() || IsDeleted();
}

bool FP4CommandLineSourceControlState::IsNew() const
{
    return !IsSourceControlled();
}

bool FP4CommandLineSourceControlState::CanAdd() const
{
    return !IsSourceControlled() && !IsAdded();
}

bool FP4CommandLineSourceControlState::CanDelete() const
{
    return IsSourceControlled() && !IsDeleted();
}

bool FP4CommandLineSourceControlState::CanCheckOut() const
{
    return IsSourceControlled() && !IsCheckedOut() && !IsCheckedOutOther();
}

bool FP4CommandLineSourceControlState::CanRevert() const
{
    return IsCheckedOut() || IsAdded() || IsDeleted();
}

bool FP4CommandLineSourceControlState::CanCheckIn() const
{
    return IsCheckedOut() || IsAdded() || IsDeleted();
}

bool FP4CommandLineSourceControlState::CanDiffAgainstBase() const
{
    return IsSourceControlled() && !IsNew();
}

bool FP4CommandLineSourceControlState::CanDiffAgainstDepot() const
{
    return IsSourceControlled() && !IsNew();
}

bool FP4CommandLineSourceControlState::CanDiffAgainstLocal() const
{
    return IsSourceControlled() && !IsNew();
}

bool FP4CommandLineSourceControlState::CanHistory() const
{
    return IsSourceControlled() && !IsNew();
}

bool FP4CommandLineSourceControlState::CanUpdateStatus() const
{
    return true;
}

bool FP4CommandLineSourceControlState::CanSync() const
{
    return IsSourceControlled() && !IsCurrent();
}

bool FP4CommandLineSourceControlState::CanLock() const
{
    return false;
}

bool FP4CommandLineSourceControlState::CanUnlock() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsLocked() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsBinary() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsMoved() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsConflicted() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsHistorical() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsUnknown() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsIgnored() const
{
    return false;
}

bool FP4CommandLineSourceControlState::CanDeleteLocal() const
{
    return true;
}

bool FP4CommandLineSourceControlState::CanRevertCheckedOut() const
{
    return CanRevert();
}

bool FP4CommandLineSourceControlState::CanRevertUnchanged() const
{
    return CanRevert();
}

bool FP4CommandLineSourceControlState::CanRevertModified() const
{
    return CanRevert();
}

bool FP4CommandLineSourceControlState::CanSubmit() const
{
    return CanCheckIn();
}

bool FP4CommandLineSourceControlState::CanDiffAgainstWorkspace() const
{
    return CanDiffAgainstDepot();
}

bool FP4CommandLineSourceControlState::CanDiffAgainstPrevious() const
{
    return IsSourceControlled() && !IsNew() && HeadRevision > 1;
}

bool FP4CommandLineSourceControlState::CanDiffAgainstHead() const
{
    return CanDiffAgainstDepot();
}

bool FP4CommandLineSourceControlState::IsUsingLocalFileRevisions() const
{
    return false;
}

bool FP4CommandLineSourceControlState::CanPreview() const
{
    return false;
}

bool FP4CommandLineSourceControlState::CanAddToIgnore() const
{
    return false;
}

bool FP4CommandLineSourceControlState::CanRemoveFromIgnore() const
{
    return false;
}

bool FP4CommandLineSourceControlState::CanAddToChangelist() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsUncontrolledChange() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsUnchecked() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsForbidCheckout() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsSlowTask() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsRedirector() const
{
    return false;
}

bool FP4CommandLineSourceControlState::CanShowInContentBrowser() const
{
    return true;
}

bool FP4CommandLineSourceControlState::CanShowInExplorer() const
{
    return true;
}

bool FP4CommandLineSourceControlState::CanShowInSystemShell() const
{
    return true;
}

bool FP4CommandLineSourceControlState::IsUASFiltered() const
{
    return false;
}

bool FP4CommandLineSourceControlState::IsPendingAdd() const
{
    return IsAdded();
}

TArray<FSourceControlRevisionRef> FP4CommandLineSourceControlState::GetHistory() const
{
    return History;
}

void FP4CommandLineSourceControlState::Update(const FString& InAction, int32 InHeadRevision, int32 InHaveRevision, bool bInOtherOpen, const FString& InOtherUser)
{
    Action = InAction;
    HeadRevision = InHeadRevision;
    HaveRevision = InHaveRevision;
    bOtherOpen = bInOtherOpen;
    OtherUserCheckedOut = InOtherUser;

    bCanDelete = CanDelete();
    bCanAdd = CanAdd();
    bCanCheckOut = CanCheckOut();
    bCanRevert = CanRevert();
    bCanCheckIn = CanCheckIn();
    bCanDiffAgainstWorkspace = CanDiffAgainstDepot();
}

#undef LOCTEXT_NAMESPACE
