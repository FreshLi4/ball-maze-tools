#include "P4CommandLineSourceControlState.h"
#include "Textures/SlateIcon.h"
#include "RevisionControlStyle/RevisionControlStyle.h"

#define LOCTEXT_NAMESPACE "P4CommandLineSourceControl.State"

int32 FP4CommandLineSourceControlState::GetHistorySize() const
{
	return History.Num();
}

TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> FP4CommandLineSourceControlState::GetHistoryItem(int32 HistoryIndex) const
{
	if (History.IsValidIndex(HistoryIndex))
	{
		return History[HistoryIndex];
	}
	return nullptr;
}

TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> FP4CommandLineSourceControlState::FindHistoryRevision(int32 RevisionNumber) const
{
	for (const auto& Revision : History)
	{
		if (Revision->GetRevisionNumber() == RevisionNumber)
		{
			return Revision;
		}
	}
	return nullptr;
}

TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> FP4CommandLineSourceControlState::FindHistoryRevision(const FString& InRevision) const
{
	for (const auto& Revision : History)
	{
		if (Revision->GetRevision() == InRevision)
		{
			return Revision;
		}
	}
	return nullptr;
}

TSharedPtr<class ISourceControlRevision, ESPMode::ThreadSafe> FP4CommandLineSourceControlState::GetCurrentRevision() const
{
	if (History.Num() > 0)
	{
		return History.Last();
	}
	return nullptr;
}

ISourceControlState::FResolveInfo FP4CommandLineSourceControlState::GetResolveInfo() const
{
	return ResolveInfo;
}

FSlateIcon FP4CommandLineSourceControlState::GetIcon() const
{
	if (IsCheckedOut())
	{
		return FSlateIcon(FRevisionControlStyleManager::GetStyleSetName(), "RevisionControl.CheckedOut");
	}
	else if (IsAdded())
	{
		return FSlateIcon(FRevisionControlStyleManager::GetStyleSetName(), "RevisionControl.OpenForAdd");
	}
	else if (IsDeleted())
	{
		return FSlateIcon(FRevisionControlStyleManager::GetStyleSetName(), "RevisionControl.MarkedForDelete");
	}
	else if (IsCheckedOutOther())
	{
		return FSlateIcon(FRevisionControlStyleManager::GetStyleSetName(), "RevisionControl.CheckedOutOther");
	}
	else if (IsConflicted())
	{
		return FSlateIcon(FRevisionControlStyleManager::GetStyleSetName(), "RevisionControl.Conflicted");
	}
	else if (!IsSourceControlled())
	{
		return FSlateIcon(FRevisionControlStyleManager::GetStyleSetName(), "RevisionControl.NotInDepot");
	}
	else if (!IsCurrent())
	{
		return FSlateIcon(FRevisionControlStyleManager::GetStyleSetName(), "RevisionControl.NotAtHeadRevision");
	}
	else
	{
		return FSlateIcon();
	}
}

FText FP4CommandLineSourceControlState::GetDisplayName() const
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
		return LOCTEXT("Deleted", "Deleted");
	}
	else if (IsCheckedOutOther())
	{
		return LOCTEXT("CheckedOutOther", "Checked Out by Other");
	}
	else if (IsConflicted())
	{
		return LOCTEXT("Conflicted", "Conflicted");
	}
	else if (!IsSourceControlled())
	{
		return LOCTEXT("NotControlled", "Not Under Revision Control");
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

FText FP4CommandLineSourceControlState::GetDisplayTooltip() const
{
	if (IsCheckedOut())
	{
		return LOCTEXT("CheckedOut_Tooltip", "Item is checked out for edit");
	}
	else if (IsAdded())
	{
		return LOCTEXT("Added_Tooltip", "Item is scheduled for addition");
	}
	else if (IsDeleted())
	{
		return LOCTEXT("Deleted_Tooltip", "Item is scheduled for deletion");
	}
	else if (IsCheckedOutOther())
	{
		if (!OtherUserCheckedOut.IsEmpty())
		{
			return FText::Format(LOCTEXT("CheckedOutOther_Tooltip", "Item is checked out by user {0}"), FText::FromString(OtherUserCheckedOut));
		}
		return LOCTEXT("CheckedOutOther_Tooltip", "Item is checked out by another user");
	}
	else if (IsConflicted())
	{
		return LOCTEXT("Conflicted_Tooltip", "The contents of the item conflict with updates received from the repository");
	}
	else if (!IsSourceControlled())
	{
		return LOCTEXT("NotControlled_Tooltip", "Item is not under version control");
	}
	else if (!IsCurrent())
	{
		return LOCTEXT("NotCurrent_Tooltip", "Item is not at the latest revision");
	}
	else
	{
		return LOCTEXT("Current_Tooltip", "There are no modifications");
	}
}

const FString& FP4CommandLineSourceControlState::GetFilename() const
{
	return LocalFilename;
}

const FDateTime& FP4CommandLineSourceControlState::GetTimeStamp() const
{
	return TimeStamp;
}

bool FP4CommandLineSourceControlState::CanCheckIn() const
{
	return IsCheckedOut() || IsAdded() || IsDeleted();
}

bool FP4CommandLineSourceControlState::CanCheckout() const
{
	return IsSourceControlled() && !IsCheckedOut() && !IsCheckedOutOther();
}

bool FP4CommandLineSourceControlState::IsCheckedOut() const
{
	return Action == TEXT("edit") || Action == TEXT("add") || Action == TEXT("delete") || Action == TEXT("branch") || Action == TEXT("integrate");
}

bool FP4CommandLineSourceControlState::IsCheckedOutOther(FString* Who) const
{
	if (bOtherOpen && Who)
	{
		*Who = OtherUserCheckedOut;
	}
	return bOtherOpen;
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

bool FP4CommandLineSourceControlState::IsIgnored() const
{
	return false;
}

bool FP4CommandLineSourceControlState::CanEdit() const
{
	return IsSourceControlled() && !IsCheckedOutOther();
}

bool FP4CommandLineSourceControlState::CanDelete() const
{
	return IsSourceControlled() && !IsDeleted();
}

bool FP4CommandLineSourceControlState::IsUnknown() const
{
	return false;
}

bool FP4CommandLineSourceControlState::IsModified() const
{
	return IsCheckedOut() || IsAdded() || IsDeleted();
}

bool FP4CommandLineSourceControlState::CanAdd() const
{
	return !IsSourceControlled() && !IsAdded();
}

bool FP4CommandLineSourceControlState::IsConflicted() const
{
	return GetResolveInfo().IsValid();
}

bool FP4CommandLineSourceControlState::CanRevert() const
{
	return IsCheckedOut() || IsAdded() || IsDeleted();
}

void FP4CommandLineSourceControlState::Update(const FString& InAction, int32 InHeadRevision, int32 InHaveRevision, bool bInOtherOpen, const FString& InOtherUser)
{
	Action = InAction;
	HeadRevision = InHeadRevision;
	HaveRevision = InHaveRevision;
	bOtherOpen = bInOtherOpen;
	OtherUserCheckedOut = InOtherUser;
	TimeStamp = FDateTime::Now();
}

#undef LOCTEXT_NAMESPACE